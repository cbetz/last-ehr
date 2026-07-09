# Backend Adapters

Backend adapters are the most useful contribution path. Last EHR already works
with Medplum and local HAPI FHIR. The next valuable adapters are Aidbox,
Oystehr, Firely Server, and other FHIR R4 backends with a clear auth story.

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

## Adapter checklist

- Add `lib/fhir/<backend>.ts`.
- Add construction and delegation tests mirroring `lib/fhir/medplum.test.ts`.
- Add auth-specific tests where useful.
- Update `createFhirBackend` if the adapter is runtime-selectable.
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
- Do not emulate access control in Last EHR.
- Do not add real patient data to fixtures or tests.
- Do not add high-risk write tools as part of an adapter PR.
