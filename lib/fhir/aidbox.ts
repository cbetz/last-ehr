import { FhirRestBackend } from "./rest";

// Aidbox adapter over the shared REST transport. Two things are easy to get
// wrong against Aidbox:
//
// - baseUrl must point at the FHIR-conformant endpoint, i.e. end in `/fhir`
//   (for example https://<box>.aidbox.app/fhir or http://localhost:8888/fhir).
//   The server also answers at the root path, but that is Aidbox's native API,
//   which returns resources in Aidbox format and would break the FHIR
//   contract silently.
// - The first supported auth mode is HTTP Basic with an Aidbox Client
//   (grant_types: ["basic"]). The admin login is a User and cannot basic-auth
//   the API; create the Client via an init bundle (see docs/adapters.md).
//   Scope what that Client can do inside Aidbox's AccessPolicy; Last EHR does
//   not add access control of its own.
//
// Registered as FHIR_BACKEND=aidbox on the synthetic-evaluation tier,
// verified against a local dev-licensed box (aidboxone:edge): real-server
// contract plus the FHIR Agent Safety Eval. See docs/support.md.
export class AidboxBackend extends FhirRestBackend {
  constructor(baseUrl: string, clientId: string, clientSecret: string) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    super({
      baseUrl,
      getHeaders: () => ({ authorization: `Basic ${basic}` }),
    });
  }
}
