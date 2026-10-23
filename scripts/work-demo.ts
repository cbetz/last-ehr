import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { DurableWorkService } from "../lib/work/service";
import { createWorkDemoFhirAdapter, WorkDemoFhirError, WORK_DEMO_FHIR_URL } from "./work-demo-fhir";
import { createWorkLabServer, LAB_REVIEWER, validateLabKeys } from "./work-demo-server";

/** Checkout-only executable: deliberately does not import dotenv or application config. */
async function main() {
  const { values } = parseArgs({
    options: {
      help: { type: "boolean", short: "h" },
      port: { type: "string", default: "3300" },
      store: { type: "string", default: ".lastehr/work-lab/work.sqlite" },
      "hapi-url": { type: "string", default: WORK_DEMO_FHIR_URL },
    },
  });
  if (values.help) {
    console.log(`Last EHR Synthetic Work Lab

Usage: npm run work:demo -- [--port 3300] [--store .lastehr/work-lab/work.sqlite]
                              [--hapi-url http://127.0.0.1:8080/fhir]

Requires a running local HAPI server. Binds only to 127.0.0.1.
Uses invented fixtures, persistent local SQLite, and separate test roles.
Makes no model-provider request and does not load .env.local.
Never enter real patient information or expose this lab through a tunnel.

Optional environment: distinct LASTEHR_WORK_ASSISTANT_KEY and
LASTEHR_WORK_REVIEWER_KEY (at least 32 characters each).
When omitted, new keys are generated and printed locally at startup.`);
    return;
  }
  if (!/^\d{1,5}$/.test(values.port!) || Number(values.port) < 1024 || Number(values.port) > 65535) {
    throw new Error("Use a local lab port between 1024 and 65535.");
  }
  const assistantKey = process.env.LASTEHR_WORK_ASSISTANT_KEY ?? randomBytes(32).toString("base64url");
  const reviewerKey = process.env.LASTEHR_WORK_REVIEWER_KEY ?? randomBytes(32).toString("base64url");
  validateLabKeys(assistantKey, reviewerKey);
  const committer = createWorkDemoFhirAdapter({ baseUrl: values["hapi-url"] });
  const fixture = await committer.getFixture();
  const service = new DurableWorkService({ storePath: resolve(values.store!), reviewer: LAB_REVIEWER, committer });
  const server = createWorkLabServer({ service, fixture, assistantKey, reviewerKey });
  try {
    await service.recover();
    await new Promise<void>((accept, reject) => {
      server.once("error", reject);
      server.listen(Number(values.port), "127.0.0.1", () => { server.off("error", reject); accept(); });
    });
  } catch (error) {
    service.close();
    throw error;
  }
  const origin = `http://127.0.0.1:${values.port}`;
  console.log(`\nLast EHR Work Lab — local, synthetic only\n\nReview inbox: ${origin}/\nAssistant page: ${origin}/assistant\nStore: ${resolve(values.store!)}\n\nAssistant API key: ${assistantKey}\nReviewer sign-in key: ${reviewerKey}\n\nKeep the reviewer key out of the assistant’s context.\nThese are local test identities, not clinical authentication.\nNo external model, telemetry, public tunnel, or .env.local is used.\nPress Ctrl+C to stop; the synthetic work records remain in SQLite.\n`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    server.close(() => { service.close(); });
    server.closeIdleConnections();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  // Only adapter diagnostics are known-static. Never print arbitrary upstream
  // errors, runtime configuration, credentials, database content or request data.
  console.error(error instanceof WorkDemoFhirError ? error.message : "The work lab could not start. Check the CLI options, distinct role keys, local HAPI service, store permissions, and available port.");
  process.exitCode = 1;
});
