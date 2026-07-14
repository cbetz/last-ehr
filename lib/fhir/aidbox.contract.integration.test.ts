import { describe } from "vitest";

import { AidboxBackend } from "@/lib/fhir/aidbox";
import { defineFhirBackendContract } from "@/test/fhir-backend-contract";

// Opt-in: aims the real-server contract at a disposable synthetic Aidbox box
// (a local dev-licensed container or a throwaway cloud sandbox). FHIR_BASE_URL
// must be the FHIR endpoint, i.e. end in /fhir:
//
//   RUN_AIDBOX_E2E=1 FHIR_BASE_URL=http://localhost:8888/fhir \
//     AIDBOX_CLIENT_ID=... AIDBOX_CLIENT_SECRET=... \
//     npx vitest run lib/fhir/aidbox.contract.integration.test.ts
//
// Never point this at a box holding real data; the contract creates and
// deletes uniquely tagged synthetic resources.
const runAidboxE2E = process.env.RUN_AIDBOX_E2E === "1";

if (!runAidboxE2E) {
  describe.skip("Aidbox integration", () => {});
} else {
  const baseUrl = process.env.FHIR_BASE_URL;
  const clientId = process.env.AIDBOX_CLIENT_ID;
  const clientSecret = process.env.AIDBOX_CLIENT_SECRET;
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      "FHIR_BASE_URL, AIDBOX_CLIENT_ID, and AIDBOX_CLIENT_SECRET are required for the Aidbox contract test.",
    );
  }

  describe("Aidbox integration", () => {
    defineFhirBackendContract({
      name: "Aidbox",
      createBackend: () => new AidboxBackend(baseUrl, clientId, clientSecret),
      // Allow for a remote sandbox; a local container is much faster.
      timeoutMs: 60_000,
    });
  });
}
