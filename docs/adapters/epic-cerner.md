# Epic and Oracle Health sandbox adapters

Experimental spike. Last EHR can sit in front of another FHIR R4 server as
the approval gate, but these two sandboxes are **not** a supported
configuration, **not** demo-eligible, and **not** a clinical, regulatory, or
compliance claim. Synthetic sandbox patients only. No real PHI.

Both adapters stay out of `createFhirBackend` unless:

```bash
LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1
```

Unset, the names `oracle-health` and `epic` are refused. They are also absent
from `KNOWN_FHIR_BACKENDS` and `DEMO_ELIGIBLE_BACKENDS`, so the demo picker
cannot offer them. The seed refuses both, because seeding deletes and
recreates charts.

Checked **2026-11-04** from this repository's network. "Live" means an HTTP
call from here. "Docs" means Oracle's or Epic's public pages, fetched the
same day, and not executed as a write.

## Oracle Health (Cerner) open sandbox — read-only adapter

`FHIR_BACKEND=oracle-health` builds `OracleHealthBackend` against the public
open endpoint. No token.

| | |
| --- | --- |
| Base URL | `https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d` |
| Auth | None. `Authorization` is not sent. |
| FHIR | R4 4.0.1 (`CapabilityStatement.fhirVersion`, live) |
| Publisher | Oracle Health. Implementation text: "Oracle Health implementation of FHIR on top of Millennium" (live `/metadata`) |

Oracle's service-root page says this endpoint is for proof-of-concept use
and that **the open endpoint exposes read-only resources. No writes are
available in sandbox without authentication.**

Live checks:

- `GET /metadata` → HTTP 200, 42 resource types. Every declared interaction
  on that statement was `read` and/or `search-type`. No `create`, `update`,
  or `delete`. `security.service` was absent (no SMART service on the open
  host).
- `GET /Patient?_id=12742400` → HTTP 200, searchset of that one id.
  `12742400` is the example patient id in Oracle's own service-root
  documentation, not a patient this repo created. The test compares ids
  only and does not record the resource.
- `GET /Patient?_id=12742400&_count=1` → HTTP 400,
  `_count: unsupported when _id is provided`. The chart tools always send
  both, so the adapter drops `_count` when `_id` is set and keeps the
  search (it does not switch to a direct read).
- `GET /Patient?_count=1` with no other parameter → HTTP 400. At least one
  of `_id`, `identifier`, `name`, `family`, `given`, `birthdate`, `phone`,
  `email`, `address-postalcode`, or `-pageContext` is required.
- `GET /Patient?name=NoSuchLastEhrProbeZz&_count=1` is what the opt-in
  conformance test uses for a name search that should not match.
- `GET /Patient?_id=12742400&_tag=https://lastehr.com/adapter-contract|no-such-tag`
  → HTTP 200 and the same patient. `_tag` is not a declared Patient search
  parameter. The self link omitted `_tag`. That is a silent ignore, which
  fails the session-isolation clause in `test/fhir-backend-contract.ts`.
- `POST /Observation` and `POST /Patient` and `DELETE /Observation/{id}` →
  HTTP 404, OperationOutcome "Not Found". The adapter does not send those
  methods. `createResource` throws `FHIR_DRY_RUN` after staging the
  resource locally. `deleteResource` throws `FHIR_READ_ONLY` and does not
  call the server.
- `GET /Task` → HTTP 404. Task is not in the CapabilityStatement.
- `GET /Communication?subject=Patient/12742400` → HTTP 400. Communication
  search requires `_id`, `category`, `recipient`, `received`, or
  `-email-status`. The chart's note query uses `subject`, so the notes
  section cannot be satisfied here.
- `GET /Observation?patient=12724066&_count=1` → HTTP 200 with **15** match
  entries and a `next` link (self link still said `_count=1`). `_count=5`
  returned 19; `_count=20` returned 34. `_count` changes the page and is
  not a hard cap. `12724066` was already on the sandbox; this repo did not
  create it, and the probe recorded counts only. Category `vital-signs`
  did narrow the same patient's page to 1 entry at `_count=1`.
- `GET /Observation?_id={id}` for an id returned by that patient search →
  HTTP 200, one match. Direct `GET /Observation/{id}` also returned 200.
  `_id` plus `_count` was not re-checked on Observation after the Patient
  400; the adapter's `_count` drop applies to every type.

Not verified on this host: `meta.tag` round-trip (there is no create),
whether `_sort` is applied (a request with `_sort=-date` returned HTTP 200,
and `_sort` is not in the declared Observation parameter list, so it may be
ignored), and any patient-access behavior. A `Condition` search for the
documented patient timed out once and was not retried.

### Dry-run write

The approval gate still runs. After approval, `commitApprovedWrite` does
**not** call `createResource` when `writeDisposition` is `dry-run`. It
keeps the proposed resource in memory and returns a unified diff whose
left side is "not on the FHIR server". The tool result is
`persisted: false` and has no server id. The chat result says the resource
was staged and not written. Provenance is not emitted. A caller that
ignores the gate and calls `createResource` gets `FHIR_DRY_RUN` instead of
a fake id.

This is not a commit. Restarting the process drops the staged copy. It is
not an audit record.

### Opt-in conformance

```bash
RUN_ORACLE_HEALTH_E2E=1 \
  npx vitest run lib/fhir/oracle-health.contract.integration.test.ts
```

That run is the read-only conformance: CapabilityStatement, documented
patient `_id` search (including the tool's `_count`), an empty name
search, an Observation searchset, the silent `_tag` ignore, the
Communication `subject` refusal, the local dry-run refusal, and a live
POST that must stay HTTP 404. It does not run
`test/fhir-backend-contract.ts` or the FHIR Agent Safety Eval. Both of
those create and delete resources. CI does not set `RUN_ORACLE_HEALTH_E2E`.

That command was run against the public open sandbox on 2026-11-04 and
passed 7/7. The same run is what the statements above mean by "live".

## Oracle Health secure sandbox — not implemented

Documented and partly fetched. No app was registered, and no token was
minted, so nothing below was executed as a read or a write of patient data.

| | |
| --- | --- |
| Non-patient base | `https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d` |
| Patient-access base | `https://fhir-myrecord.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d` (docs only; this host was not requested) |
| SMART discovery | `GET {non-patient base}/.well-known/smart-configuration` → HTTP 200 |
| Metadata | `GET {non-patient base}/metadata` → HTTP 200, FHIR 4.0.1, `security` code `SMART-on-FHIR` |
| Unauthenticated Patient search | HTTP 401, `token-required` |

Discovery (live) said:

- `grant_types_supported`: `authorization_code`, `client_credentials`
- `token_endpoint_auth_methods_supported`: `client_secret_basic`, `private_key_jwt`
- signing algs: `RS384`, `ES384`
- `capabilities` included `launch-ehr`, `launch-standalone`, `client-public`, `client-confidential-symmetric`, `client-confidential-asymmetric`, `permission-patient`, `permission-user`
- authorize (provider persona): `https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/protocols/oauth2/profiles/smart-v1/personas/provider/authorize`
- token: `https://authorization.cerner.com/tenants/ec2458f2-1e24-41c8-b71b-0e701af7583d/hosts/fhir-ehr-code.cerner.com/protocols/oauth2/profiles/smart-v1/token`
- PKCE: `S256`

Two auth paths, neither implemented in this spike:

1. **Standalone or EHR launch** — `authorization_code` against the provider
   authorize endpoint (or the patient persona, which was not fetched).
   code Console registration, a CernerCare account, and a browser login.
   That is the path Oracle's "Build and Test SMART on FHIR Applications"
   page describes after the open endpoint.
2. **Backend services** — `client_credentials` with `private_key_jwt`
   (RS384 or ES384) or `client_secret_basic`. A system app registered in
   code Console. No browser redirect. This is the path an agent process
   can actually run.

Secure CapabilityStatement interactions that matter here (live metadata,
not exercised):

| Resource | Declared interactions | In `scopes_supported` |
| --- | --- | --- |
| Patient | read, search-type, create, patch | `system/Patient.read`, `.write`, `.crus` (and patient/user forms) |
| Observation | read, search-type, create, update | `system/Observation.read`, `.write`, `.crus` |
| Communication | read, search-type, create, patch | `system/Communication.read`, `.write`, `.crus` |
| Provenance | read, search-type, create | `system/Provenance.read`, `.write`, `.crs` |
| Task | not declared | no scope whose name contained `Task` |
| AuditEvent | not declared | no scope whose name contained `Audit` |

Coverage is the only resource in that statement whose interactions included
`delete`. Observation and Patient did not.

Oracle's public create pages, not executed:

- [Create an Observation](https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-observation-post.html)
  requires a bearer token. One category (`vital-signs`, `laboratory`, or a
  narrow imaging set). Unsupported fields are ignored. The page lists
  Provider and System authorization. The tool's free-text Observation is
  not that shape.
- [Create a Communication](https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/op-communication-post.html)
  requires `contentAttachment` (base64), a Practitioner sender, a
  Practitioner or Group recipient, category `notification` or `reminder`
  (or SNOMED `312853008`), and status `completed`. The tool sends
  `contentString` and a Patient subject. That body does not match.

`meta.tag` persistence and `_tag` / `_tag:not` were not tested on the
secure host. The open host ignores `_tag`. Do not assume the secure host
is different until a credentialed probe says so.

## Epic sandbox — auth scaffold, no secrets

`FHIR_BACKEND=epic` builds `EpicBackend` only when the flag is on **and**
either `EPIC_ACCESS_TOKEN` or both `EPIC_CLIENT_ID` and `EPIC_PRIVATE_KEY`
are set. The private key is a PKCS#8 PEM in the environment. It is not
read from the repo. CI does not set `RUN_EPIC_E2E`, and the live test
throws if that flag is set without credentials, so a green CI run has not
talked to Epic.

| | |
| --- | --- |
| FHIR base | `https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4` |
| Authorize | `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize` |
| Token | `https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token` |

Live, unauthenticated:

- `GET {base}/metadata` → HTTP 200. `fhirVersion` 4.0.1. `software.name`
  `Epic`, `software.version` `August 2026`, `releaseDate` `2026-08-10`.
  `implementation.description` `FHIR Sandbox FHIR Server`. The statement's
  own `experimental` field was `true` (Epic's flag, not ours).
- `security` codes: OAuth, SMART-on-FHIR, and Basic. The oauth-uris
  extension carried the authorize and token URLs above. No `register` URL
  was in that extension on this fetch.
- `GET {base}/.well-known/smart-configuration` → HTTP 200.
  `grant_types_supported`: `authorization_code`, `refresh_token`,
  `client_credentials`, plus the JWT-bearer and token-exchange grant URNs.
  `token_endpoint_auth_methods_supported`: `client_secret_post`,
  `client_secret_basic`, `private_key_jwt`. `code_challenge_methods_supported`:
  `S256`. `capabilities` included `launch-ehr`, `launch-standalone`,
  `client-public`, `client-confidential-symmetric`,
  `client-confidential-asymmetric`, `context-standalone-patient`,
  `permission-patient`, `permission-user`.
  `scopes_supported` was only `epic.scanning.dmsusername`, `fhirUser`,
  `launch`, `openid`, `profile`. It did **not** list `system/*` or
  `patient/*` resource scopes. Those are chosen per registered app.
  Signing algs were not a field on this document.
- `GET {base}/Patient?name=Lopez&_count=1` → HTTP 401, body `""`.

CapabilityStatement interactions (live metadata, not exercised with a token):

| Resource | Interactions | Search notes |
| --- | --- | --- |
| Patient | create, read, search-type | `_id`, `name`, `identifier`, `_count` declared. `_tag` was not a search parameter on any resource (the only name containing "tag" was Condition `stage`). |
| Observation | create, read, search-type, update | `patient`, `subject`, `category`, `code`, `date`, `_id`, `_count` declared |
| Communication | create, read, search-type | `patient`, `subject`, `category`, `status`, `_id` declared |
| Task | read, search-type, update | **no create** |
| Provenance | read | no search parameters |
| AuditEvent | not declared | |
| Any resource | **no delete** | the statement listed zero `delete` interactions |

No delete means `test/fhir-backend-contract.ts` cannot clean up here even
after a token exists. The safety eval has the same problem.

### Which auth path the scaffold implements

**Backend services**, because an agent process has no browser session.
Epic's public OAuth documentation ("Using a JWT to Obtain an Access Token
for a Backend Service", fetched 2026-11-04) says the token POST is
`application/x-www-form-urlencoded` with:

- `grant_type=client_credentials`
- `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`
- `client_assertion` = the JWT

JWT claims they require: `iss` and `sub` are the app's client id, `aud` is
the token URL, `jti` is unique, `exp` is in the future and at most 5
minutes ahead, and `exp` is at most 5 minutes after `iat` and `nbf`. `iat`
and `nbf` must not be in the future. Header `alg` is RS384 in this adapter
(Epic also documents RS256, RS512, and, for a JWKS URL, ES256/ES384; RS384
is what their troubleshooting text prefers). Optional `kid` comes from
`EPIC_PRIVATE_KEY_ID`. Optional `scope` is sent only when `EPIC_SCOPES` is
set; the documented required body does not include it, because scopes are
registered on the app.

Registration is out of band, on fhir.epic.com: Backend Systems, OAuth 2.0,
and a public key or JWKS URL. Use the **non-production** client id against
this sandbox. The client id is not a secret. The private key is. This repo
does not contain a private key. Epic says a new public key can take up to
60 minutes to sync to the sandbox. Sandbox client-to-user mapping is
automatic; customer non-production is not, and was not tested.

**Standalone launch is not implemented.** Epic's same documentation says
the app redirects the user to the authorize endpoint, Epic shows a login
(MyChart for a patient-facing app), and the app exchanges the code at the
token endpoint. PKCE S256 is advertised. EHR launch (LaunchPad or
Hyperdrive) is a third path and also not implemented. Both need a person
at a browser. An agent in front of the sandbox should use backend services.

The unit test generates an ephemeral RS384 key, checks the token POST
shape, and checks the JWT claims. It does not call Epic.

```bash
# skipped in CI
RUN_EPIC_E2E=1 \
  EPIC_CLIENT_ID='...' \
  EPIC_PRIVATE_KEY='-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----' \
  npx vitest run lib/fhir/epic.contract.integration.test.ts
```

`EPIC_ACCESS_TOKEN` skips the assertion if you minted a token elsewhere.
Writes on this adapter are the normal REST POST. They are **unverified**.
Do not treat a successful unit test as a sandbox write.

## Where the tool contract holds

The contract is `FhirBackend` in `lib/fhir/backend.ts`: structured search,
`_id` search rather than direct read, `meta.tag` preserved on create, and
`deleteResource` for seed and tests only. The web tools then need Patient
search, chart reads, and approval-gated creates of Communication,
Observation, and Task.

| Need | Oracle open (live) | Oracle secure (docs + metadata) | Epic sandbox (metadata + docs) |
| --- | --- | --- | --- |
| Patient search by name | Yes, with a selective parameter | Declared; not called | Declared; unauthenticated call was 401 |
| Patient by `_id` search | Yes. `_count` must be omitted or the server returns 400 | Declared; not called | Declared; not called |
| Observation read | Yes, by `patient` or `_id` | Declared | Declared |
| Communication read the way the chart asks (`subject`) | No. HTTP 400 | Not called. Open host's search parameters do not include `subject` | `subject` is declared. Not called |
| Observation create the tool sends | No. POST 404. Approval stages a diff | Create exists, but the public body is a coded vital or lab, not the tool's free text. Not called | `create` is declared. The accepted body was not checked |
| Communication create (`contentString`) | No. POST is not routed | Create exists and requires `contentAttachment`. Not called | `create` is declared. The accepted body was not checked |
| Task create | No. Task is absent | Task is absent, and no Task scope was advertised | `update` and search only. No create |
| Provenance create | No | `create` declared. Not called | `read` only |
| `meta.tag` kept on create | Cannot be tested | Not tested | Not tested |
| `_tag` / `_tag:not` isolation | `_tag` silently ignored | Not tested | `_tag` is not a declared parameter |
| Delete for the contract harness | Not routed (HTTP 404). Adapter refuses locally | Observation and Patient do not declare delete | No resource declares delete |

So the open Oracle adapter can search patients and read observations.
It cannot satisfy the write half of the tool contract, and the approval
gate tells the truth about that. Epic's statement *declares* Patient,
Observation, and Communication creates, and does not declare Task create
or any delete. None of those creates were performed.

## What this spike did not do

- No code Console or fhir.epic.com app registration.
- No token request against either authorization server.
- No write, delete, or `$everything` against either sandbox, except the
  open Oracle POSTs and DELETEs that returned 404.
- No FHIR Agent Safety Eval. That eval creates and deletes.
- No SMART launch UI, no PKCE client, no EHR launch.
- The patient-access Cerner host (`fhir-myrecord.cerner.com`) was not requested.
- Epic Basic auth, which the CapabilityStatement still lists, was not tried.
- `_sort`, paging, and `_count` were sampled, not specified.
- No claim that either sandbox is US Core compliant, production-ready, or
  appropriate for real patient data. Epic's own sandbox statement is
  marked experimental. Oracle's open host is a shared synthetic sandbox.

## Maintainers' sandbox conformance keys

These are the maintainers' sandbox conformance keys. Public halves only.
Private keys are never committed. Anyone running the adapters must register
their own keys with the sandbox. These documents do not authenticate any
other deployment.

| Sandbox | Public JWKS | `kid` |
| --- | --- | --- |
| Epic | <https://lastehr.com/.well-known/jwks/epic-sandbox.json> | `lastehr-epic-1` |
| Oracle Health | <https://lastehr.com/.well-known/jwks/oracle-sandbox.json> | `lastehr-oracle-1` |

The files are `public/.well-known/jwks/epic-sandbox.json` and
`public/.well-known/jwks/oracle-sandbox.json`. The apex host redirects to
`www.lastehr.com` and keeps the path. Register the `www` URL if the sandbox
does not follow redirects.

## Next step for a real write path

Use the **secure** Oracle sandbox or Epic **backend services**, not the
open host.

1. Register a system app (Oracle code Console, or Epic Backend Systems
   with a non-production client id and a JWKS URL). Put the private key
   only in the environment.
2. On Oracle, point a new adapter at
   `https://fhir-ehr-code.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d`
   and mint with `private_key_jwt` against the token URL above. Scope it
   to `system/Patient.read`, `system/Observation.read`, and
   `system/Observation.write` first. Confirm a vital-sign Observation
   create that matches Oracle's published body, then read it back. Expect
   the current tool body (free-text code, `contentString` Communication,
   Task) to be rejected or stored as something else. Change the tool
   resource, or keep the dry-run, per resource — do not report a 4xx as a
   saved id.
3. On Epic, run `RUN_EPIC_E2E=1` with the env vars above, then try one
   Observation create and one Communication create on a sandbox test
   patient from Epic's published test-patient list. Stop if the server
   assigns an id the response does not echo; the tools require
   `Prefer: return=representation`.
4. Before either backend can pass `test/fhir-backend-contract.ts`, it
   needs a cleanup story. Neither statement offers Observation or Patient
   delete. Also probe `_tag` and `meta.tag` with a credential. The open
   Oracle host already ignores `_tag`, so session isolation is not
   available there, and it is unproven on the hosts that can write.
5. Task is the hard stop on both secure statements. `create_task` cannot
   be a FHIR Task create until one of them grows that interaction.
