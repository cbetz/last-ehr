# FHIR backend adapter starter

This is a working, network-free starting point for a standard FHIR R4 REST
backend that uses a bearer token. It is **not** a supported runtime backend and
does not add a value to `FHIR_BACKEND`.

Copy the folder, rename the class, and adapt the auth or client setup:

```bash
cp -R examples/fhir-adapter-starter /tmp/acme-adapter
```

The included unit test uses `test/fhir-rest-adapter-contract.ts`, which proves:

1. Structured collection search and `_id` lookup.
2. FHIR `Accept`, `Content-Type`, and `Prefer` headers.
3. `meta.tag` persistence in the create payload.
4. OperationOutcome error handling and delete behavior.

Run it from the repository root:

```bash
npm test -- examples/fhir-adapter-starter/backend.test.ts
```

Then add a target-specific, opt-in integration test using
`test/fhir-backend-contract.ts`. That test creates and deletes uniquely tagged
synthetic resources, so point it only at a disposable sandbox or local
container—not production or real PHI.

Use `lib/fhir/hapi.ts` as the local HAPI proof and `lib/fhir/medplum.ts` as the
SDK-wrapper reference. Keep auth, tenancy, and server quirks inside the
adapter; never add backend-specific branches to `lib/ai/tools.ts`.
