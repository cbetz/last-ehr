# Epic and Oracle Health sandboxes

Last EHR can sit in front of the Epic FHIR R4 sandbox and the Oracle Health
(Cerner) secure sandbox as the approval gate. A human sees the Observation
the server will accept, approves it, and the agent gets a read-back of what
was stored. Synthetic sandbox patients only. This is not a clinical,
regulatory, or compliance claim, and it is not a supported production
configuration.

Both adapters stay off unless:

```bash
export LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
```

The flag stays. The sandboxes do not support delete, so the contract harness
and the FHIR Agent Safety Eval cannot clean up after themselves, and an
approved write **persists on the shared sandbox**. Epic search often returns
HTTP 403 unless the app was given a search scope (read by id can still
succeed). Oracle's sandbox accepted LOINC `8331-1` and returned HTTP 422 for
LOINC `8867-4`. That is one proven Observation shape per vendor, not the full
tool contract (notes, tasks, superseding observations, `meta.tag` isolation).
They are not demo-eligible.

Checked against the sandboxes on 2026-11-04 with synthetic patients. The
request bodies are in `lib/fhir/fixtures/`.

## Ten minutes

### 1. Generate a key and host the public JWKS

The private key stays on the machine that runs Last EHR. The app
registration gets only the public JWKS.

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out lastehr-sandbox.pem
npx tsx scripts/print-sandbox-jwks.ts lastehr-sandbox.pem lastehr-epic-1
```

The printed JSON has `kty`, `n`, `e`, `alg` (`RS384`), `use` (`sig`), and
`kid`. It must not contain `d` or any other private component. Host that
document at an HTTPS URL you control. Use a different `kid` (for example
`lastehr-oracle-1`) if you register a second app. Do not commit the PEM.

The JWKS URLs published from this repository are the maintainers' sandbox
conformance keys only. They do not authenticate any other deployment.
Register your own public key. See [Maintainers' sandbox conformance keys](#maintainers-sandbox-conformance-keys).

### 2. Register the app

**Epic.** On [fhir.epic.com](https://fhir.epic.com), create a non-production
app, Backend Systems, OAuth 2.0, and point it at the JWKS URL. Epic says a
new public key can take up to an hour to reach the sandbox. Scopes are
stored on the app. The token request does not send `scope` unless you set
`LASTEHR_SCOPES`. Give the app Observation read and create, plus Patient and
Encounter read. Search is a separate scope from read: without it, Patient
and Observation searches return HTTP 403 and Last EHR reports that the app
lacks the search scope. A direct read of a known id can still succeed.

Sandbox base and token URLs, if you do not override them:

```text
https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4
https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token
```

**Oracle Health.** In the Cerner code Console, register a system app for
the sandbox tenant with `private_key_jwt` (RS384) and the same JWKS URL.
Oracle's token endpoint rejects `client_credentials` when `scope` is
omitted, so `LASTEHR_SCOPES` is required. A minimal set:

```text
system/Patient.read system/Observation.read system/Observation.write system/Encounter.read
```

Secure sandbox defaults for the public tenant:

```text
https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d
https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token
```

Override both with the env vars below for another tenant. The open sandbox
(`fhir-open.cerner.com`, no token) stays read-only: approved writes are
staged and diffed, not posted.

### 3. Point the process at one sandbox

One process, one FHIR server. `LASTEHR_*` wins over the older `EPIC_*` and
`ORACLE_*` names. The private key is the PEM or a path. Neither the key nor
the access token is written to logs.

Epic:

```bash
export LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
export FHIR_BACKEND=epic
export LASTEHR_FHIR_BASE_URL='https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4'
export LASTEHR_TOKEN_URL='https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token'
export LASTEHR_CLIENT_ID='your-non-production-client-id'
export LASTEHR_PRIVATE_KEY_PATH="$PWD/lastehr-sandbox.pem"
export LASTEHR_KEY_ID='lastehr-epic-1'
export LASTEHR_ENCOUNTER='Encounter/eMT95RPaM-HxLc3NeIA5qlQ3'
# optional; omit unless you want to override the app's registered scopes
# export LASTEHR_SCOPES=''
```

`LASTEHR_ENCOUNTER` is the sandbox Encounter the profile puts on the
Observation when the agent does not pass one. Epic rejected a vital that
had no encounter (HTTP 400, "required element missing" at `encounter`).
The id above is from Epic's published sandbox data for the synthetic
patient Camila Lopez (`Patient/erXuFYUfucBZaryVksYEcMg3`), not a patient
this repository created.

Oracle:

```bash
export LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
export FHIR_BACKEND=oracle-health
export LASTEHR_FHIR_BASE_URL='https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d'
export LASTEHR_TOKEN_URL='https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token'
export LASTEHR_CLIENT_ID='your-system-client-id'
export LASTEHR_PRIVATE_KEY_PATH="$PWD/lastehr-sandbox.pem"
export LASTEHR_KEY_ID='lastehr-oracle-1'
export LASTEHR_SCOPES='system/Patient.read system/Observation.read system/Observation.write system/Encounter.read'
export LASTEHR_PERFORMER='Practitioner/12724064'
```

`LASTEHR_PERFORMER` is filed as a Practitioner with
`event-performerFunction` code `LA` (legal authenticator). That is the
performer on the Observation the sandbox accepted.

`LASTEHR_PRIVATE_KEY` may replace `LASTEHR_PRIVATE_KEY_PATH`. Keep newlines
as real newlines or as `\n` inside the quoted value. A pre-minted
`EPIC_ACCESS_TOKEN` or `ORACLE_ACCESS_TOKEN` skips the assertion. Do not
put that token in the repo.

Start the app the way you already do (`npm run dev` with the rest of your
model and session env). The web approval card reads the same profile the
write uses.

### 4. Approve one write

Epic, in the chat, against the synthetic sandbox patient:

```text
Record a heart rate of 72 bpm for patient erXuFYUfucBZaryVksYEcMg3
```

The card shows LOINC `8867-4` and Epic flowsheet code `8` (system
`urn:oid:1.2.840.114350.1.13.0.1.7.2.707679`, display Pulse), plus the
encounter. LOINC alone was rejected: the sandbox answered HTTP 400,
"Multiple Flowsheet rows found by given codes: 8;1400000000". The mapping
table is `EPIC_FLOWSHEET_MAPPINGS` in `lib/fhir/vendor-profile.ts`. Add a
row only after you have confirmed that flowsheet code. Unmapped LOINC
codes are refused before the approve button is offered.

Oracle:

```text
Record an oral temperature of 37 Cel for patient 12724066
```

The card shows LOINC `8331-1` and the legal-authenticator performer.
`8867-4` is refused with the sandbox's HTTP 422. The allowlist is
`ORACLE_VITAL_ALLOWLIST` in the same file. Patient `12724066` (PATCHTEST,
NANCY) and Practitioner `12724064` are synthetic sandbox records.

Approve. Epic answers 201 with an empty body and a `Location` header; the
adapter reads the id from that header (the proven id is 66 characters).
Oracle answers 201 with `Location: .../Observation/VS-…`. Both requests
use `application/fhir+json`.

The tool result includes a read-back diff: what was sent against what a
direct GET returned. Oracle's comparison ignores codings the server added
(the proof added a Millennium codeSet/72 code and LOINC `8310-5`) and a
unit-translation extension on `valueQuantity` (the proof added a degF
translation). A changed value is still reported as a mismatch. The diff is
not a statement that the vital is clinically correct.

Notes, tasks, and superseding observations are refused on these two
backends. Those bodies were not part of the proven write.

There is no delete. The Observation you just approved remains on the
sandbox. Do not point this at a server that holds real patient data.

## Auth, in short

The token POST is `application/x-www-form-urlencoded`:

- `grant_type=client_credentials`
- `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
- `client_assertion` = an RS384 JWT
- `scope` only when `LASTEHR_SCOPES` is set (required for Oracle, omitted for Epic unless you set it)

JWT claims: `iss` and `sub` are the client id, `aud` is the token URL,
`jti` is unique, `exp` is at most five minutes ahead. The header carries
`alg` RS384 and `kid` from `LASTEHR_KEY_ID`. The access token is cached
until shortly before `expires_in`. Standalone SMART launch is not
implemented.

## Tests

Unit tests replay the recorded bodies and do not touch the network:

```bash
npx vitest run \
  lib/fhir/smart-backend.test.ts \
  lib/fhir/vendor-profile.test.ts \
  lib/fhir/read-back.test.ts \
  lib/fhir/epic.test.ts \
  lib/fhir/oracle-health.test.ts
```

Live checks read credentials from the environment and are skipped in CI:

```bash
RUN_EPIC_E2E=1 npx vitest run lib/fhir/epic.contract.integration.test.ts
RUN_ORACLE_E2E=1 npx vitest run lib/fhir/oracle-health.write.integration.test.ts
```

`RUN_ORACLE_E2E` authenticates and searches. It does not create a resource,
because that resource would persist. The open-sandbox read check is still
`RUN_ORACLE_HEALTH_E2E=1`.

## What this does not do

- No claim that a sandbox is US Core compliant, production-ready, or fit for real patient data.
- No delete, so no contract harness and no safety eval on these hosts.
- No SMART launch UI, no PKCE client, no EHR launch.
- No Task create. Epic's statement has no Task create. Oracle's statement does not list Task.
- The open Oracle host ignores `_tag`. Session isolation is not available there and was not proven on the hosts that can write.
- The patient-access Cerner host (`fhir-myrecord.cerner.com`) was not used.
- Epic Basic auth, which the CapabilityStatement still lists, was not tried.

## Maintainers' sandbox conformance keys

These are the maintainers' sandbox conformance keys. Public halves only.
Private keys are never committed. Anyone running the adapters must register
their own keys with the sandbox. These documents do not authenticate any
other deployment.

| Sandbox | Public JWKS | `kid` |
| --- | --- | --- |
| Epic | <https://www.lastehr.com/.well-known/jwks/epic-sandbox.json> | `lastehr-epic-1` |
| Oracle Health | <https://www.lastehr.com/.well-known/jwks/oracle-sandbox.json> | `lastehr-oracle-1` |

The files are `public/.well-known/jwks/epic-sandbox.json` and
`public/.well-known/jwks/oracle-sandbox.json`. The apex host redirects to
`www.lastehr.com` and keeps the path. Register the `www` URL if the sandbox
does not follow redirects.
