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
//   (grant_types: ["basic"]). Scope what that Client can do inside Aidbox's
//   AccessPolicy; Last EHR does not add access control of its own.
//
// This adapter is NOT registered in createFhirBackend yet: running Aidbox
// requires a (free, self-service) license, so it has no repository-verifiable
// synthetic target. See docs/adapters.md for the verification path that flips
// the factory switch.
export class AidboxBackend extends FhirRestBackend {
  constructor(baseUrl: string, clientId: string, clientSecret: string) {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    super({
      baseUrl,
      getHeaders: () => ({ authorization: `Basic ${basic}` }),
    });
  }
}
