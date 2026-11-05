import { describe, expect, it } from "vitest";

import { assessSmartAuth } from "./smart-config";
import { OracleHealthBackend } from "./oracle-health";

/**
 * Live authenticated Oracle sandbox check. Skipped unless a maintainer opts
 * in. It does not create a resource: the sandbox does not support delete,
 * so a write would persist. Credentials come from the environment only.
 *
 *   RUN_ORACLE_E2E=1 \
 *   LASTEHR_CLIENT_ID=... LASTEHR_PRIVATE_KEY=... LASTEHR_KEY_ID=... \
 *   LASTEHR_SCOPES='system/Patient.read system/Observation.read system/Observation.write' \
 *   npx vitest run lib/fhir/oracle-health.write.integration.test.ts
 */
const run = process.env.RUN_ORACLE_E2E === "1";

if (!run) {
  describe.skip("Oracle Health authenticated sandbox", () => {});
} else if (assessSmartAuth(process.env, "oracle").state !== "ready") {
  throw new Error(
    "RUN_ORACLE_E2E=1 requires LASTEHR_CLIENT_ID, LASTEHR_PRIVATE_KEY or LASTEHR_PRIVATE_KEY_PATH, and LASTEHR_SCOPES, or ORACLE_ACCESS_TOKEN. Do not commit them.",
  );
} else {
  describe("Oracle Health authenticated sandbox", () => {
    it("authenticates and reads the secure sandbox CapabilityStatement", async () => {
      const backend = OracleHealthBackend.fromEnv(process.env);
      expect(backend.writeDisposition).toBe("persist");
      const bundle = await backend.search("Patient", { _count: "1" });
      expect(bundle.resourceType).toBe("Bundle");
    }, 60_000);
  });
}
