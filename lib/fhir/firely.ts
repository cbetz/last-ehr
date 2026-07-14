import { FhirRestBackend } from "./rest";

// Firely Server speaks standard FHIR R4 REST, so the shared transport does
// the work. The first supported auth mode is a static bearer token, or none:
// the public evaluation sandbox at https://server.fire.ly is anonymous,
// synthetic, and periodically wiped, which makes it a usable disposable
// verification target. A self-hosted Firely Server is normally fronted by an
// OAuth2/SMART token service; mint the token outside Last EHR and pass it in.
// Access control and tenancy stay the server's job, per the adapter contract.
export class FirelyBackend extends FhirRestBackend {
  constructor(baseUrl: string, accessToken?: string) {
    super({
      baseUrl,
      getHeaders: accessToken
        ? () => ({ authorization: `Bearer ${accessToken}` })
        : undefined,
    });
  }
}
