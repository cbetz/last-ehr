import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

import { FirelyBackend } from "./firely";

// Wire-level contract against mocked fetch, once per auth mode: anonymous
// (the public evaluation sandbox) and static bearer token (self-hosted behind
// a token service).
defineFhirRestAdapterContract({
  name: "Firely Server (anonymous)",
  createBackend: (baseUrl) => new FirelyBackend(baseUrl),
});

defineFhirRestAdapterContract({
  name: "Firely Server (bearer token)",
  createBackend: (baseUrl) => new FirelyBackend(baseUrl, "firely-test-token"),
  expectedHeaders: { authorization: "Bearer firely-test-token" },
});
