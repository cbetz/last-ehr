import { defineFhirRestAdapterContract } from "@/test/fhir-rest-adapter-contract";

import { AidboxBackend } from "./aidbox";

// Wire-level contract against mocked fetch. Basic auth is the first supported
// mode; the expected header is base64("lastehr-client:lastehr-secret").
defineFhirRestAdapterContract({
  name: "Aidbox (basic auth client)",
  createBackend: (baseUrl) =>
    new AidboxBackend(baseUrl, "lastehr-client", "lastehr-secret"),
  expectedHeaders: {
    authorization: `Basic ${Buffer.from("lastehr-client:lastehr-secret").toString("base64")}`,
  },
});
