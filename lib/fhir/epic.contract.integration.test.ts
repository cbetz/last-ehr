import { describe, expect, it } from "vitest";

import { EpicBackend } from "./epic";
import { assessSmartAuth } from "./smart-config";

/**
 * Live Epic sandbox check. Skipped unless a maintainer opts in AND supplies
 * credentials. CI does not set either. No secret belongs in this file.
 *
 *   RUN_EPIC_E2E=1 EPIC_CLIENT_ID=... EPIC_PRIVATE_KEY=... \
 *     npx vitest run lib/fhir/epic.contract.integration.test.ts
 */
const run = process.env.RUN_EPIC_E2E === "1";
const epicReady = assessSmartAuth(process.env, "epic").state === "ready";

if (!run) {
  describe.skip("Epic sandbox integration", () => {});
} else if (!epicReady) {
  throw new Error(
    "RUN_EPIC_E2E=1 requires LASTEHR_CLIENT_ID and LASTEHR_PRIVATE_KEY (or LASTEHR_PRIVATE_KEY_PATH), or EPIC_CLIENT_ID and EPIC_PRIVATE_KEY, or EPIC_ACCESS_TOKEN. Do not commit them.",
  );
} else {
  describe("Epic sandbox integration", () => {
    it("authenticates and reads the sandbox CapabilityStatement", async () => {
      const backend = EpicBackend.fromEnv(process.env);
      const bundle = await backend.search("Patient", { _count: "1" });
      expect(bundle.resourceType).toBe("Bundle");
    }, 60_000);
  });
}
