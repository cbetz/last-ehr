import { describe } from "vitest";

import { OystehrBackend } from "@/lib/fhir/oystehr";
import { defineFhirBackendContract } from "@/test/fhir-backend-contract";

// Opt-in real-server contract against a DISPOSABLE Oystehr sandbox project.
// The default unit suite stays network-free; a maintainer runs this with M2M
// credentials whose access policy allows FHIR Search/Read/Create/Delete:
//
//   RUN_OYSTEHR_E2E=1 OYSTEHR_CLIENT_ID=... OYSTEHR_CLIENT_SECRET=... \
//     npx vitest run lib/fhir/oystehr.contract.integration.test.ts
//
// OYSTEHR_BASE_URL and OYSTEHR_PROJECT_ID are optional (the base URL
// defaults to the hosted FHIR R4 endpoint). Never point this at a project
// containing real data: the contract creates and deletes tagged synthetic
// resources.
const runOystehrE2E = process.env.RUN_OYSTEHR_E2E === "1";

if (!runOystehrE2E) {
  describe.skip("Oystehr integration", () => {});
} else {
  const clientId = process.env.OYSTEHR_CLIENT_ID;
  const clientSecret = process.env.OYSTEHR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "OYSTEHR_CLIENT_ID and OYSTEHR_CLIENT_SECRET are required for the Oystehr contract test.",
    );
  }

  describe("Oystehr integration", () => {
    defineFhirBackendContract({
      name: "Oystehr",
      createBackend: () =>
        new OystehrBackend({
          clientId,
          clientSecret,
          baseUrl: process.env.OYSTEHR_BASE_URL || undefined,
          projectId: process.env.OYSTEHR_PROJECT_ID || undefined,
        }),
      // A remote SaaS sandbox; writes can be slower than a local container.
      timeoutMs: 60_000,
    });
  });
}
