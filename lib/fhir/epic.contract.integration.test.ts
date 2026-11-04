import { describe, expect, it } from "vitest";

import { EpicBackend } from "./epic";

/**
 * Live Epic sandbox check. Skipped unless a maintainer opts in AND supplies
 * credentials. CI does not set either. No secret belongs in this file.
 *
 *   RUN_EPIC_E2E=1 EPIC_CLIENT_ID=... EPIC_PRIVATE_KEY=... \
 *     npx vitest run lib/fhir/epic.contract.integration.test.ts
 */
const run = process.env.RUN_EPIC_E2E === "1";

if (!run) {
  describe.skip("Epic sandbox integration", () => {});
} else if (
  !process.env.EPIC_CLIENT_ID ||
  !(process.env.EPIC_PRIVATE_KEY || process.env.EPIC_ACCESS_TOKEN)
) {
  throw new Error(
    "RUN_EPIC_E2E=1 requires EPIC_CLIENT_ID and EPIC_PRIVATE_KEY, or EPIC_ACCESS_TOKEN. Do not commit them.",
  );
} else {
  describe("Epic sandbox integration", () => {
    it("authenticates and reads the sandbox CapabilityStatement", async () => {
      const backend = new EpicBackend({
        accessToken: process.env.EPIC_ACCESS_TOKEN || undefined,
        clientId: process.env.EPIC_CLIENT_ID,
        privateKeyPem: process.env.EPIC_PRIVATE_KEY,
        privateKeyId: process.env.EPIC_PRIVATE_KEY_ID || undefined,
        scopes: process.env.EPIC_SCOPES || undefined,
        baseUrl: process.env.EPIC_BASE_URL || undefined,
        tokenUrl: process.env.EPIC_TOKEN_URL || undefined,
      });
      const bundle = await backend.search("Patient", { _count: "1" });
      expect(bundle.resourceType).toBe("Bundle");
    }, 60_000);
  });
}
