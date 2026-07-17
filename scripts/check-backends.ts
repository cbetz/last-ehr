import { config as loadEnv } from "dotenv";

import {
  DEMO_BACKEND_TIERS,
  KNOWN_FHIR_BACKENDS,
  parseDemoBackendEntries,
} from "../lib/fhir/demo-backends";
import { hasFhirBackendConfig } from "../lib/fhir/backend";

// Sanity-checks the demo backend picker allowlist (NEXT_PUBLIC_DEMO_BACKENDS)
// before a deploy: unknown ids, ineligible tiers, and missing per-backend env
// are all fatal, because the runtime drops them SILENTLY by design (the
// chat route falls back to the deployment default with no signal). This
// script is where an operator finds out loudly. No network required.
// It validates the env visible to THIS shell (.env.local/.env), not the
// deploy target's dashboard vars — run it where the app's env actually lives.
loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

function requiredEnvFor(id: string): string {
  switch (id) {
    case "medplum":
      return "MEDPLUM_CLIENT_ID + MEDPLUM_CLIENT_SECRET (quickstart mints the demo token)";
    case "hapi":
      return "HAPI_BASE_URL (the shared FHIR_BASE_URL counts only when hapi is the deployment default)";
    case "firely":
      return "FIRELY_BASE_URL (or FHIR_BASE_URL when firely is the deployment default)";
    case "aidbox":
      return "AIDBOX_BASE_URL (or FHIR_BASE_URL when aidbox is the default), plus AIDBOX_CLIENT_ID + AIDBOX_CLIENT_SECRET";
    default:
      return "";
  }
}

function main(): void {
  const entries = parseDemoBackendEntries(process.env.NEXT_PUBLIC_DEMO_BACKENDS);
  if (entries.length === 0) {
    console.log("NEXT_PUBLIC_DEMO_BACKENDS is empty; no picker is rendered.");
    return;
  }

  let failed = false;
  for (const entry of entries) {
    if (!entry.known) {
      console.error(
        `UNKNOWN     ${entry.id} — not an adapter id (${KNOWN_FHIR_BACKENDS.join(", ")}).`,
      );
      failed = true;
      continue;
    }
    if (!entry.eligible) {
      console.error(
        `INELIGIBLE  ${entry.id} — ${DEMO_BACKEND_TIERS[entry.id as keyof typeof DEMO_BACKEND_TIERS]} tier (docs/support.md); the runtime drops it. ` +
          "Demo eligibility is a code-level gate (DEMO_ELIGIBLE_BACKENDS in lib/fhir/demo-backends.ts); flipping it requires a governance PR with contract-harness evidence.",
      );
      failed = true;
      continue;
    }
    if (!hasFhirBackendConfig(entry.id)) {
      console.error(
        `UNCONFIGURED ${entry.id} — missing ${requiredEnvFor(entry.id)}; the runtime silently falls back to the default.`,
      );
      failed = true;
      continue;
    }
    console.log(`ok          ${entry.id} (${entry.label})`);
    if (entry.id === "hapi") {
      console.warn(
        "            hapi is local-evaluation only (docs/support.md): never offer it on a publicly reachable deployment.",
      );
    }
  }
  if (failed) process.exit(1);
}

main();
