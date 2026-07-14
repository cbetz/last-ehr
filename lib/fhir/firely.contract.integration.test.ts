import { describe } from "vitest";

import { FirelyBackend } from "@/lib/fhir/firely";
import { defineFhirBackendContract } from "@/test/fhir-backend-contract";

// Opt-in: aims the real-server contract at a disposable synthetic Firely
// target. The public evaluation sandbox works:
//
//   RUN_FIRELY_E2E=1 FHIR_BASE_URL=https://server.fire.ly \
//     npx vitest run lib/fhir/firely.contract.integration.test.ts
//
// Never point this at a server holding real data; the contract creates and
// deletes uniquely tagged synthetic resources.
const runFirelyE2E = process.env.RUN_FIRELY_E2E === "1";

if (!runFirelyE2E) {
  describe.skip("Firely Server integration", () => {});
} else {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) {
    throw new Error("FHIR_BASE_URL is required for the Firely contract test.");
  }

  describe("Firely Server integration", () => {
    defineFhirBackendContract({
      name: "Firely Server",
      createBackend: () =>
        new FirelyBackend(
          baseUrl,
          process.env.FIRELY_ACCESS_TOKEN || undefined,
        ),
      // The public sandbox is remote and shared; writes can be slow.
      timeoutMs: 60_000,
    });
  });
}
