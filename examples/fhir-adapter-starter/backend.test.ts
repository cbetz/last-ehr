import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

import { ExampleBearerFhirBackend } from "./backend";

// This is an executable, network-free starter. Copy this directory to begin a
// real adapter, then add a separate opt-in synthetic integration test for the
// target server or sandbox.
defineFhirRestAdapterContract({
  name: "Example bearer-token FHIR backend",
  createBackend: (baseUrl) =>
    new ExampleBearerFhirBackend(baseUrl, "example-test-token"),
  expectedHeaders: { authorization: "Bearer example-test-token" },
});
