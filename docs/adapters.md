# Backend Adapters

Backend adapters are the most useful contribution path. Medplum is supported
today; the local HAPI FHIR stack and the Firely Server and Aidbox adapters
below are for synthetic evaluation only. The next valuable adapters are
FHIR R4 backends with a clear auth story (OpenEMR is a documented no-go
for now — see issue #123).

## Start with the executable starter

For a standard FHIR R4 REST backend, begin with
[`examples/fhir-adapter-starter`](../examples/fhir-adapter-starter). It is a
working bearer-token adapter over the shared `FhirRestBackend`, plus a
network-free contract suite:

```bash
npm test -- examples/fhir-adapter-starter/backend.test.ts
```

Copy and rename it, then replace only the client/auth behavior. This starter is
not a supported backend and does not add a new `FHIR_BACKEND` value. Keep an
unverified adapter out of the runtime factory until its target server has a
documented synthetic-data verification path.

## Contract

Implement `FhirBackend` from `lib/fhir/backend.ts`:

```ts
export interface FhirBackend {
  search<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<Bundle<ExtractResource<K>>>;

  searchResources<K extends ResourceType>(
    resourceType: K,
    params?: Record<string, string>,
  ): Promise<ExtractResource<K>[]>;

  createResource<T extends Resource>(resource: T): Promise<T & { id: string }>;

  deleteResource(resourceType: ResourceType, id: string): Promise<void>;
}
```

Contract notes:

- Fetch single resources through search (`_id=<id>`), not direct read, because
  compartment-scoped policies may only be enforced on the search path.
- Preserve `meta.tag` exactly when creating resources. The public demo relies
  on tags to isolate visitor writes.
- Use structured params, never raw query string concatenation.
- `deleteResource` is for seeding/admin scripts only. It must not be exposed as
  an agent tool.

## Contract harnesses

Use both layers of verification for a new adapter:

| Harness | What it proves | When to run it |
| --- | --- | --- |
| [`test/fhir-rest-adapter-contract.ts`](../test/fhir-rest-adapter-contract.ts) | Structured collection search, `_id` lookup, FHIR request headers, `meta.tag` payload preservation, error handling, and delete semantics. | Normal unit test; mocked `fetch`, no account or server needed. |
| [`test/fhir-backend-contract.ts`](../test/fhir-backend-contract.ts) | The four `FhirBackend` methods against a real server. It creates and deletes uniquely tagged synthetic resources. | Opt-in integration test against a disposable sandbox or local container only. |
| [FHIR Agent Safety Eval](./evals.md) | Search/chart mechanics, proposal gating, approved and denied deterministic writes, chart association, and cleanup through the real web-agent tools. | Opt-in synthetic target only; call `runFhirAgentSafetyEval` with `confirmSyntheticTarget: true` from the adapter's own sandbox test. |

The repository's HAPI adapter runs both: its REST contract is unit-tested and
its real-server contract runs in the local HAPI CI job. A target-specific
adapter PR should add the same two layers, then verify the web agent's four
synthetic workflows.

## Demo picker eligibility and dev output

Two things an adapter PR does **not** need to touch:

- The demo dev-output panel observes at the `FhirBackend` interface
  (`lib/fhir/observed.ts`, a decorator like the scripted wrapper), so
  adapters need no instrumentation of their own.
- The demo backend picker's eligibility gate (`DEMO_ELIGIBLE_BACKENDS` in
  `lib/fhir/demo-backends.ts`) is deliberately separate from adapter
  support. A verified synthetic-evaluation adapter is still not
  demo-pickable; flipping eligibility is its own governance PR with
  support-matrix and `_tag`-isolation evidence (see
  [docs/support.md](./support.md)).

## Adapter checklist

- Start from `examples/fhir-adapter-starter` or `lib/fhir/hapi.ts`, then add
  `lib/fhir/<backend>.ts`.
- Run the REST adapter contract suite and add auth-specific unit tests.
- Add an opt-in real-server test using `test/fhir-backend-contract.ts`.
- Run the [FHIR Agent Safety Eval](./evals.md) against the same disposable
  target and retain its scrubbed report or CI link with the PR.
- Update `createFhirBackend` only once the adapter is documented and verified
  for a concrete target.
- Update `.env.example`.
- Update `README.md` and `docs/quickstart.md`.
- Add setup notes with exact versions, Docker images, cloud sandbox, or account
  requirements.
- Verify all four tools end to end with synthetic data:
  - search patients
  - show chart
  - add note with approval
  - record observation with approval
- Document caveats: auth, tenancy, audit logs, unsupported search parameters,
  server-specific quirks.

## Firely Server (synthetic evaluation only)

[`lib/fhir/firely.ts`](../lib/fhir/firely.ts) is a working adapter over the
shared REST transport, registered as `FHIR_BACKEND=firely`. Its auth modes are
anonymous or a static bearer token in `FIRELY_ACCESS_TOKEN`; a production
Firely Server fronts its FHIR API with an OAuth2/SMART token service, and the
adapter deliberately takes a pre-minted token rather than running that flow.

```bash
FHIR_BACKEND=firely
FHIR_BASE_URL=https://server.fire.ly
```

Its verification target is Firely's public synthetic sandbox
(`https://server.fire.ly`), which is anonymous, shared, and periodically
wiped. That makes it a good disposable target and an unacceptable place for
anything but synthetic data. Both verification layers are opt-in and
repeatable:

```bash
RUN_FIRELY_E2E=1 FHIR_BASE_URL=https://server.fire.ly \
  npx vitest run lib/fhir/firely.contract.integration.test.ts
npm run eval -- --backend firely --base-url https://server.fire.ly --confirm-synthetic
```

Persistent synthetic charts (the same four patients the demo uses) can be
seeded with the same explicit confirmation the eval requires, because the
seed deletes and recreates matching charts:

```bash
FHIR_BACKEND=firely FIRELY_BASE_URL=https://server.fire.ly \
  npm run seed -- --confirm-synthetic
```

Caveats: no SMART launch or MCP on this tier; the sandbox enforces no access
control, so treat every record on it as public; and Last EHR does not manage
Firely tokens, tenancy, or audit logs.

## Aidbox (synthetic evaluation only)

[`lib/fhir/aidbox.ts`](../lib/fhir/aidbox.ts) is a verified evaluation
adapter over the shared REST transport, registered as `FHIR_BACKEND=aidbox`.
Auth is HTTP Basic from an Aidbox Client (`grant_types: ["basic"]`):

```bash
FHIR_BACKEND=aidbox
FHIR_BASE_URL=http://localhost:8888/fhir
AIDBOX_CLIENT_ID=lastehr
AIDBOX_CLIENT_SECRET=<your-client-secret>
```

Two Aidbox specifics the adapter encodes:

- The base URL must be the FHIR-conformant endpoint, i.e. end in `/fhir`.
  The root path serves Aidbox's native API, which returns resources in
  Aidbox format and would break the contract silently.
- Scope the Client with Aidbox AccessPolicy; Last EHR adds no access control
  of its own.

Repeatable setup for a disposable local box (this is the configuration the
adapter was verified against, on `aidboxone:edge`):

1. Create a free dev license in the [Aidbox portal](https://aidbox.app) and
   download its generated Docker Compose file into a directory **outside**
   this repository (the file is named `docker-compose.yaml`, which collides
   with this repo's compose files).
2. If the compose maps `8080:8080`, remap the host port; this repo's local
   HAPI stack owns 8080. `8888:8080` matches the examples here.
3. Basic auth requires a `Client` resource, and the box's admin login is a
   `User` (console UI only), so create the Client with an init bundle rather
   than curl-as-admin. Save `init-bundle.json` next to the compose file:

   ```json
   {
     "resourceType": "Bundle",
     "type": "batch",
     "entry": [
       {
         "request": { "method": "PUT", "url": "/Client/lastehr" },
         "resource": {
           "resourceType": "Client",
           "id": "lastehr",
           "secret": "<your-client-secret>",
           "grant_types": ["basic"]
         }
       },
       {
         "request": { "method": "PUT", "url": "/AccessPolicy/lastehr-allow" },
         "resource": {
           "resourceType": "AccessPolicy",
           "id": "lastehr-allow",
           "engine": "allow",
           "link": [{ "resourceType": "Client", "id": "lastehr" }]
         }
       }
     ]
   }
   ```

   and wire it into the `aidbox` service in the compose file:

   ```yaml
   volumes:
     - ./init-bundle.json:/init-bundle.json:ro
   environment:
     BOX_INIT_BUNDLE: file:///init-bundle.json
   ```

   Then `docker compose up -d --force-recreate aidbox`. The allow-all
   AccessPolicy is for a disposable synthetic box only; scope it before
   anything real.
4. Re-run both verification layers:

   ```bash
   RUN_AIDBOX_E2E=1 FHIR_BASE_URL=http://localhost:8888/fhir \
     AIDBOX_CLIENT_ID=lastehr AIDBOX_CLIENT_SECRET=<your-client-secret> \
     npx vitest run lib/fhir/aidbox.contract.integration.test.ts
   AIDBOX_CLIENT_ID=lastehr AIDBOX_CLIENT_SECRET=<your-client-secret> \
     npm run eval -- --backend aidbox --base-url http://localhost:8888/fhir --confirm-synthetic
   ```

Caveats: a dev license is required to run the box at all; no SMART launch or
MCP on this tier; and the box's AccessPolicy, tenancy, and audit logs remain
Aidbox's job, not this layer's.

### Hosted sandbox verification and demo eligibility

A hosted Aidbox dev sandbox (Health Samurai-hosted, `edge`, FHIR 4.0.1) was
verified on 2026-07-18 with the same two layers plus the seed: real-server
contract 5/5 — including the session-isolation clause — and the FHIR Agent
Safety Eval 7/7. On that basis `aidbox` is **demo-eligible**
(`DEMO_ELIGIBLE_BACKENDS`) for operator-owned boxes. Two findings worth
knowing:

- Aidbox silently ignores the bare-system `_tag:not` token (verified by
  probe: a tagged row came back from `_tag:not=<system>|`), so session
  visibility runs on the app's client-side filter arm — safe, with the
  documented window-crowding caveat under heavy concurrent load.
- Anonymous access is rejected (401) and only the Basic-auth Client can act;
  before pointing a public demo at a box, scope the Client's AccessPolicy to
  the demo's resource types rather than the allow-all used for verification.

## Oystehr (verified synthetic evaluation)

[`lib/fhir/oystehr.ts`](../lib/fhir/oystehr.ts) is an adapter over the shared
REST transport for [Oystehr](https://oystehr.com) (formerly ZapEHR), the
hosted headless EHR behind the open-source Ottehr. It is registered as
`FHIR_BACKEND=oystehr` and was **verified 2026-07-21** against a
developer-tier sandbox: real-server contract 5/5 — including the
`_tag`/`_tag:not` session-isolation clause; a direct probe additionally
confirmed Oystehr honors the bare-system `_tag:not` token server-side
(a tagged row was excluded), so isolation needs no client-side filter
arm, unlike Aidbox — and the
FHIR Agent Safety Eval 7/7, plus a persistence probe confirming
`meta.security` and `meta.tag` survive create round-trips. The developer
tier is non-production/no-PHI by contract — synthetic data only.

Auth is an M2M client's OAuth2 client credentials: the adapter POSTs a JSON
body to `https://auth.zapehr.com/oauth/token` (audience
`https://api.zapehr.com`), caches the 24-hour JWT until shortly before its
`exp`, and single-flights concurrent mints. The FHIR base defaults to the
hosted R4 endpoint (`https://fhir-api.zapehr.com/r4`, which serves R4B) and
deliberately does not fall back to the shared `FHIR_BASE_URL`.

```bash
FHIR_BACKEND=oystehr
OYSTEHR_CLIENT_ID=<m2m client id>
OYSTEHR_CLIENT_SECRET=<m2m client secret>
# Optional; M2M tokens embed the project claim, but the official docs'
# examples send the header, so the adapter does too when configured:
# OYSTEHR_PROJECT_ID=<project id>
```

Minting sandbox credentials (a free developer account; the Bronze tier is
non-production/no-PHI by contract — synthetic data only either way):

1. Create an account at the [Oystehr quickstart](https://docs.oystehr.com/oystehr/getting-started/quickstart/)
   and log into the developer console. Every new project auto-creates a
   default M2M client.
2. On the M2M client's details page, copy the Client ID and rotate the
   secret to reveal it (shown once; rotating again invalidates the old one).
3. Give the client an access policy that allows at least `FHIR:Search`,
   `FHIR:Read`, and `FHIR:Create`; the seed and contract harness also need
   `FHIR:Delete`:

   ```json
   { "rule": [{ "resource": ["FHIR:*"], "action": ["FHIR:*"], "effect": "Allow" }] }
   ```

   The allow-all policy is for a disposable synthetic project only.
4. Run both verification layers (the search-semantics clause matters here:
   Oystehr documents `_tag` and `_tag:not` support, and its own SDK builds
   multi-tenancy on them):

   ```bash
   RUN_OYSTEHR_E2E=1 OYSTEHR_CLIENT_ID=... OYSTEHR_CLIENT_SECRET=... \
     npx vitest run lib/fhir/oystehr.contract.integration.test.ts
   OYSTEHR_CLIENT_ID=... OYSTEHR_CLIENT_SECRET=... \
     npm run eval -- --backend oystehr --confirm-synthetic
   ```

Caveats: no SMART launch or MCP on this tier; Oystehr's access policies,
tenancy, and audit logs remain Oystehr's job; URL length is capped at 10KB
(irrelevant for this adapter's small queries); and the public
CapabilityStatement is stale — trust the documented search-parameter list
plus the verification runs, not `/metadata`.

## Suggested adapter issues

Open or pick up one adapter at a time. A good issue title looks like:

```text
Backend adapter: Aidbox
```

The issue should include:

- Backend product/version.
- Auth mode to support first.
- How the maintainer can verify it.
- Any known FHIR search parameter differences.

## What not to do

- Do not add a backend-specific branch inside `lib/ai/tools.ts`.
- Do not add an unverified backend name to `FHIR_BACKEND` unless the same PR
  documents its synthetic verification path in this guide and adds a
  verification-pending row to [docs/support.md](./support.md) — and never
  imply support in marketing copy before the verification lands.
- Do not emulate access control in Last EHR.
- Do not add real patient data to fixtures or tests.
- Do not add high-risk write tools as part of an adapter PR.
