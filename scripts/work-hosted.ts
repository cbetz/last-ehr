import { realpathSync } from "node:fs";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

import { createHostedWorkAuth } from "../lib/work/hosted-auth";
import { hostedWorkAuthConfig, readHostedWorkConfig } from "../lib/work/hosted-config";
import { DurableWorkService } from "../lib/work/service";
import { createWorkHostedFhirAdapter } from "./work-hosted-fhir";
import { WorkDemoFhirError } from "./work-demo-fhir";
import { createHostedWorkServer } from "./work-hosted-server";

export async function runHostedWork(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { help: { type: "boolean", short: "h" }, config: { type: "string" } } });
  if (values.help) { console.log("Last hosted synthetic Work service\nUsage: npm run work:hosted -- --config /private/work-hosted.json\nRequires explicit HTTPS/OIDC configuration, a private persistent SQLite store, and the dedicated synthetic HAPI stack. One workspace, one reviewer, one replica. No model API key is read. Never use patient data. See docs/hosted-work.md."); return; }
  if (!values.config) throw new Error("A private hosted configuration file is required.");
  const config = readHostedWorkConfig(values.config);
  const auth = createHostedWorkAuth(hostedWorkAuthConfig(config));
  const committer = createWorkHostedFhirAdapter({ baseUrl: config.hapiUrl });
  // HAPI may still be starting when the container is first scheduled.
  const deadline = Date.now() + 180_000;
  while (true) {
    try { await committer.getFixture(); break; }
    catch (error) { if (!(error instanceof WorkDemoFhirError) || error.code !== "FHIR_UNAVAILABLE" || Date.now() >= deadline) { auth.close(); throw new Error("The private synthetic FHIR service did not become ready."); } await new Promise((accept) => setTimeout(accept, 2000)); }
  }
  const service = new DurableWorkService({ storePath: config.storePath, reviewer: auth.reviewerActor, committer });
  const hosted = createHostedWorkServer({ publicOrigin: config.publicOrigin, issuer: config.issuer, auth, service, readContext: () => committer.readContext() });
  try {
    await service.recover({ limit: 10 });
    await new Promise<void>((accept, reject) => { hosted.server.once("error", reject); hosted.server.listen(config.listenPort, config.listenHost, () => { hosted.server.off("error", reject); accept(); }); });
  } catch { await hosted.close(); service.close(); throw new Error("The hosted Work listener could not start."); }
  console.log("Last hosted Work is ready. Synthetic-only. Reviewer and assistant authentication are separate. No credentials are logged.");
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; process.off("SIGINT", stop); process.off("SIGTERM", stop); void hosted.close().catch(() => { console.error("Hosted Work shutdown could not finish cleanly. Check persistent work state before restarting."); process.exitCode = 1; }).finally(() => service.close()); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) void runHostedWork().catch(() => {
  console.error("Hosted Work could not start. Check --help, private configuration, OIDC endpoints, synthetic FHIR readiness, and persistent-store permissions. Configuration and upstream diagnostics were withheld.");
  process.exitCode = 1;
});
