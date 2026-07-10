import { FhirRestBackend } from "@/lib/fhir/rest";

/**
 * Copy and rename this class when a FHIR R4 backend authenticates with a static
 * bearer token. Replace only the auth/client details; the shared REST transport
 * retains structured search, FHIR media types, write tags, and error handling.
 */
export class ExampleBearerFhirBackend extends FhirRestBackend {
  constructor(baseUrl: string, accessToken: string) {
    super({
      baseUrl,
      getHeaders: () => ({ authorization: `Bearer ${accessToken}` }),
    });
  }
}
