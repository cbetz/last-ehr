# Assistant Work Lab

The Work Lab is a checkout-only, local experiment for durable assistant work
with a separate review step. It uses invented patients, local SQLite, and a
local HAPI FHIR server. It calls no external model and is not a deployed Muse,
Grok Bot, eve, or production clinical integration.

An assistant submits one bounded follow-up Task proposal, checks its progress,
and can cancel pending work. A separately credentialed reviewer inspects the
exact proposal and approves or declines it. Last commits an approved Task and
verifies it against FHIR before reporting completion. A FHIR Task records
requested work; it does not mean someone contacted a patient or completed the
clinical follow-up.

## Run locally

Prerequisites are the repository's supported Node version, installed
dependencies, and Docker for the local HAPI stack. Start that stack and then
the lab:

```bash
npm install
docker compose up -d
FHIR_BACKEND=hapi HAPI_BASE_URL=http://127.0.0.1:8080/fhir npm run fhir:wait
npm run work:demo
```

The default review UI is `http://127.0.0.1:3300`. The CLI uses local HAPI at
`http://127.0.0.1:8080/fhir` and refuses unavailable or incompatible servers.
The lab binds only to loopback, does not load `.env.local`, and does not need
Medplum credentials, a model API key, a public tunnel, or an assistant account.
Do not expose its port publicly.

Startup supplies distinct assistant and reviewer keys. Keep the reviewer key
out of the assistant's context. For repeatable local runs, supply separate
`LASTEHR_WORK_ASSISTANT_KEY` and `LASTEHR_WORK_REVIEWER_KEY` values through the
environment; each must be at least 32 characters and they must differ. They
represent fixed lab principals, not verified people or clinical workforce
identities.

Use a separate, human-owned browser/profile for the Review inbox. A
computer-use assistant must not control that profile or have its reviewer key
or session. Both lab pages share an origin: a bot controlling a signed-in
reviewer's browser could act through that session even without reading the
HttpOnly cookie. Distinct keys and an HttpOnly cookie do not prove human
presence.

The default work store is `.lastehr/work-lab/work.sqlite`;
`npm run work:demo -- --store <local-path>` selects another store. The CLI also
accepts `--port` and a numeric loopback-only `--hapi-url`. Work records survive
process restarts when the same store is used.
Retain the configured keys securely if you want repeatable access; do not
commit keys, databases, or exports to Git.

The store's parent directory must be private to the current OS user. The lab
creates its default private directory when needed and refuses an existing
parent with group/other access; it does not change unrelated folder
permissions. Include SQLite journal/sidecar files when moving or removing a
stopped lab's store. Removing SQLite does not delete committed FHIR Tasks.

## Walk through a proposal

1. Open `http://127.0.0.1:3300/assistant` and connect with the assistant key.
   Inspect the invented patient/result, enter a synthetic follow-up request,
   and choose **Submit for review**. Save the Work ID.
2. In the separate human-owned browser/profile, open
   `http://127.0.0.1:3300/` and sign in with the reviewer key. Inspect the
   description, patient, reviewed source version, due date if supplied, and
   exact FHIR resource. Choose **Approve and save Task** or **Decline**.
3. Check that Work ID from the Assistant page. A confirmed save includes the
   Task ID and a verification receipt. Declined work shows no-write status.
4. Stop and restart the lab with the same store, reconnect, and look up the
   Work ID again. Startup checks interrupted commits. The reviewer can also
   choose **Reconcile interrupted saves**; that operation reads FHIR and never
   blindly creates a replacement Task.

The Assistant page simulates an assistant caller. It does not run a model.
To exercise both outcomes, submit a different second proposal and decline it.

The [October 23 verification record](./evidence/assistant-work-2026-10-23.md)
documents the independent FHIR reads, actual process restarts, and test limits.

## Interface boundary

Assistant requests use the assistant Bearer credential. The browser reviewer
signs in separately and uses reviewer-only routes.

| Surface | Purpose |
| --- | --- |
| `GET /api/fixture` | Retrieve the one synthetic patient/result pair allowed in the lab. |
| `POST /api/work` | Submit a bounded Task proposal. |
| `GET /api/work/:id` | Retrieve the proposal's state and available result. |
| `POST /api/work/:id/cancel` | Cancel work when its current state permits it. |
| `POST /api/reviewer/session` | Establish the separate local reviewer session. |
| `GET /api/reviewer/work` | List work for the review UI. |
| `POST /api/reviewer/work/:id/decision` | Approve or decline the exact `proposalHash` shown to the reviewer. |
| `POST /api/reviewer/recover` | Reconcile uncertain commits by reading FHIR; no create retry. |

The assistant has no decision endpoint. Separate credentials prevent an
assistant-only caller from making a reviewer request; they cannot prove that
an operator has kept the reviewer key away from a bot. The lab intentionally
has no production identity provider or multi-tenant authorization system.

For a scripted assistant caller, the following example uses `curl` and `jq`.
In another terminal, set `LASTEHR_WORK_ASSISTANT_KEY` to the assistant key
printed at startup. Then submit the fixture context:

```bash
(
  set -e
  set -o pipefail
  curl --fail-with-body --silent --show-error \
    --header "Authorization: Bearer $LASTEHR_WORK_ASSISTANT_KEY" \
    http://127.0.0.1:3300/api/fixture \
    | jq '.fixture | {patientId, source, description: "Review the selected synthetic result with the care team."}' \
    | curl --fail-with-body --silent --show-error \
      --header "Authorization: Bearer $LASTEHR_WORK_ASSISTANT_KEY" \
      --header 'Content-Type: application/json' \
      --header 'idempotency-key: first-follow-up-v1' \
      --data-binary @- \
      http://127.0.0.1:3300/api/work
)
```

The response is `{ "job": ... }`. Keep the returned ID and use the same
assistant authorization header with `GET /api/work/<id>` to poll. Reuse an
idempotency key only when retrying the identical draft; a changed draft with
the same key conflicts. Use a fresh key for separate work. The key is 1–128
characters from letters, digits, `.`, `_`, `:`, and `-`. The request body is
`{ patientId, source: { reference, versionId }, description, dueDate? }`, where
the source comes from the fixture endpoint and `dueDate` is an optional valid
calendar date in `YYYY-MM-DD` format. Timestamps and unknown fields are refused.

## What persists and what reaches FHIR

SQLite stores the synthetic proposal, its hash, role identifiers, decisions,
state, and commit receipt. The lab resolves one fixture pair using marker
identifiers `synthetic-patient-v1` and `synthetic-result-v1`, verifies their
exact invented content, and returns the server-assigned IDs and current source
version from `GET /api/fixture`. An arbitrary patient or remote FHIR endpoint is
outside this experiment.

HAPI normalizes versioned reference fields, so the proposed Task uses an
unversioned `focus.reference` plus an explicit `Task.input` string labeled
**Reviewed source version**, containing `Observation/<id>/_history/<version>`.
Both fields are shown for review, bound by the proposal hash, and checked
against the persisted resource. This representation does not relax general
resource matching: the verifier still checks the exact reviewed Task fields.

| State | Meaning |
| --- | --- |
| `awaiting_review` | Persisted proposal waiting for its designated lab reviewer. |
| `committing` | An approved commit has started; it must not be treated as cancellable pending work. |
| `succeeded` | The approved Task was found and matched to the proposal; a receipt is available. |
| `denied`, `cancelled`, `expired` | The pending proposal was closed without starting its commit. |
| `failed` | A bounded failure prevented confirmed completion; inspect the failure code. |
| `needs_reconciliation` | The write outcome is uncertain; reconcile before deciding what happened. |

An approved write uses conditional creation and an independent read to check
the recorded Task. If the response is lost or the process stops during a
commit, startup recovery searches for the outcome before reporting it. It
does not blindly create another Task. An uncertain outcome remains distinct
from a confirmed save.

An assistant's request to cancel is not evidence that an already-started
commit was undone. Inspect the final state and receipt. The lab does not
offer a delete/rollback tool or turn a chart write into a reversible action.

## How this relates to MCP and agent frameworks

This lab exercises Last-owned work and review boundaries over a small local
HTTP API. It does not replace the published
[MCP server](./mcp.md) or implement MCP Tasks or A2A. Its API is a development
surface and can change.

Muse and Grok Bot connector tests, external OAuth, MCP Tasks adapters, and an
eve reference worker remain follow-up work. Passing the lab's scripted tests
does not prove any host's approval UI or patient-data handling. The existing
MCP elicitation gate trusts the host to collect a decision; a capability
declaration is not independent proof of human review.

## Verify the lab

Run the focused store, API, and FHIR adapter tests with:

```bash
npm test -- lib/work scripts/work-demo-server.test.ts scripts/work-demo-fhir.test.ts
```

With the local HAPI stack running, the dedicated browser suite uses its own
Playwright configuration and starts a lab on port 3301:

```bash
npm run test:work:e2e
```

These tests exercise synthetic lab mechanics. Production OAuth for the work
API, clinical reviewer identity and authorization, actual Muse/Grok Bot
connections, and PHI-qualified infrastructure remain unimplemented or
unverified.

## Limits and clinical deployment

This is a single-machine synthetic experiment. SQLite file permissions,
separate local keys, proposal hashing, and FHIR verification demonstrate
mechanics; they do not establish clinical identity, tenant isolation,
encryption at rest, a complete audit program, or HIPAA qualification. Local
HAPI itself has no authentication. Anyone who controls the computer, keys,
database, or FHIR server can bypass this lab's intended boundaries.

See [HIPAA deployment groundwork](./hipaa-deployment.md) for the data map and
the exact service, agreement, engineering, and operational evidence still
needed before a real-patient pilot. Use invented data in integration examples,
recordings, and evaluator sessions.
