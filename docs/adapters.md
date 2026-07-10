# Backend Adapters

Backend adapters are the most useful contribution path. Last EHR already works
with Medplum and local HAPI FHIR. The next valuable adapters are Aidbox,
Oystehr, Firely Server, and other FHIR R4 backends with a clear auth story.

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

The repository's HAPI adapter runs both: its REST contract is unit-tested and
its real-server contract runs in the local HAPI CI job. A target-specific
adapter PR should add the same two layers, then verify the web agent's four
synthetic workflows.

## Adapter checklist

- Start from `examples/fhir-adapter-starter` or `lib/fhir/hapi.ts`, then add
  `lib/fhir/<backend>.ts`.
- Run the REST adapter contract suite and add auth-specific unit tests.
- Add an opt-in real-server test using `test/fhir-backend-contract.ts`.
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
- Do not add an unverified backend name to `FHIR_BACKEND` or imply support in
  marketing copy.
- Do not emulate access control in Last EHR.
- Do not add real patient data to fixtures or tests.
- Do not add high-risk write tools as part of an adapter PR.
