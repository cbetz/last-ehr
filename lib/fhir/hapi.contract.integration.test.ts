import { describe } from "vitest";

import { HapiBackend } from "@/lib/fhir/hapi";
import { defineFhirBackendContract } from "@/test/fhir-backend-contract";

// The default unit suite remains Docker-free. CI enables this after preparing
// the repository's local HAPI stack, and adapter authors can mirror this shape
// for their own sandbox or container-backed implementation.
const runHapiE2E = process.env.RUN_HAPI_E2E === "1";

if (!runHapiE2E) {
  describe.skip("HAPI integration", () => {});
} else {
  const baseUrl = process.env.FHIR_BASE_URL;
  if (!baseUrl) {
    throw new Error("FHIR_BASE_URL is required for the HAPI contract test.");
  }

  describe("HAPI integration", () => {
    defineFhirBackendContract({
      name: "HAPI FHIR",
      createBackend: () => new HapiBackend(baseUrl),
    });
  });
}
