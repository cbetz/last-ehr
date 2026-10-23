# Synthetic assistant work verification — October 23, 2026

This evidence covers the checkout-only [Assistant Work Lab](../assistant-work.md),
not a deployed assistant integration or clinical service. Tests ran locally on
Node 22.18.0 against HAPI FHIR v8.10.0-2 and Postgres 17 in a separate Docker
Compose project. The FHIR port was bound to numeric loopback. The lab uses
invented fixtures, local SQLite, and scripted assistant/reviewer identities;
it makes no external model request and does not load `.env.local`.

## Observed boundaries

| Boundary | Evidence |
| --- | --- |
| Assistant → proposal | Authenticated HTTP submission persisted an immutable Task and hash without creating a FHIR Task. Repeated submission with the same key returned the same work ID; changed content conflicted. |
| Reviewer → decision | Assistant credentials could not establish a reviewer session or use decision endpoints. A reviewer decision required the exact proposal hash and same-origin session. These test credentials do not establish human presence or clinical identity. |
| Decision → FHIR | Browser approval produced one Task found by an independent identifier search. The persisted description, patient, source, source-version input, due date, and remaining reviewed fields matched the proposal. |
| Decline → FHIR | A second browser proposal was declined; an independent FHIR search found zero matching Tasks. HTML-shaped input rendered as text. |
| Interrupted HTTP response | The adapter test let HAPI persist a Task, discarded the successful response, then reconciled by identifier. Repeated conditional creation still found one Task. |
| Process restart | The CLI test used three distinct processes and one private SQLite store. A pending proposal/hash survived the first restart; approval then persisted one Task; the next restart retained the receipt and still found one Task. |
| Invalid source | A stale source version was rejected without a Task. A separate test rejected a stale search result when the direct source read reported a newer version. |
| Browser | Both browser flows passed without page errors. The approved workflow also passed a 390-pixel viewport overflow check. |

HAPI normalizes versioned FHIR references. The lab therefore uses an unversioned
`Task.focus` and preserves the exact reviewed source version in `Task.input`
as a string. Both are shown, hashed, and checked after persistence. The matcher
was not relaxed to accept a changed reviewed reference.

## Reproduce

With the local HAPI stack running:

```bash
npx vitest run lib/work/service.test.ts scripts/work-demo-server.test.ts scripts/work-demo-fhir.test.ts
RUN_HAPI_E2E=1 npx vitest run scripts/work-demo-fhir.hapi.integration.test.ts scripts/work-demo.restart.hapi.integration.test.ts
npm run test:work:e2e
```

Local results: **53 focused unit/API tests, 4 actual HAPI integration tests,
and 2 browser tests passed**. Repository tests, TypeScript, lint, and the
production build also passed; lint retains existing warnings in unrelated
components. CI repeats the HAPI recovery and browser checks.

## Limits

This proves bounded mechanics for a single-machine synthetic lab. It does not
prove genuine human review, clinical correctness, atomic source freshness
across unrelated FHIR changes, production identity/authorization, encryption
at rest, operational resilience, vendor agreements, or HIPAA readiness.
An uncertain save with no verified matching Task remains blocked; recovery
does not blindly retry a create. The public hosted app and published MCP
package do not expose these new lab endpoints. Muse, Grok Bot, MCP Tasks,
A2A, and an eve executor have not been integrated by this change.
