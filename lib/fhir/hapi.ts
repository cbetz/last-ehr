import { FhirRestBackend } from "./rest";

// HAPI's JPA starter uses standard FHIR R4 REST with no credentials. Keep this
// concrete adapter tiny; contributors building a REST-style backend can reuse
// FhirRestBackend while owning their auth and verification story.
export class HapiBackend extends FhirRestBackend {
  constructor(baseUrl: string) {
    super({ baseUrl });
  }
}
