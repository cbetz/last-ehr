# Assistant Work Lab

The Work Lab is a checkout-only, local experiment for durable assistant work
with a separate review step. In its opt-in agent mode, a configured model reads
one invented patient's selected result, drafts a follow-up Task from your
request, and submits it to Last's review inbox. A separately credentialed
reviewer inspects the exact proposal and approves or declines it. Last commits
an approved Task, reads it back from FHIR, and reports the verified result to
the assistant page.

The lab uses invented patients, local SQLite, and a local HAPI FHIR server.
Real agent mode calls your configured model provider. Default manual mode
and the explicitly scripted test mode do not. This is not a deployed Muse,
Grok Bot, eve, or production clinical integration. A FHIR Task records
requested work; a successful run does not mean someone contacted a patient or
completed the clinical follow-up.

## Run locally

Prerequisites are the repository's supported Node version, installed
dependencies, Docker for the local HAPI stack, and a supported model API
account for real agent mode. Start the stack:

```bash
npm install
docker compose up -d
FHIR_BACKEND=hapi HAPI_BASE_URL=http://127.0.0.1:8080/fhir npm run fhir:wait
```

Configure the model in your local environment file, then explicitly start the
model-backed lab:

```bash
npm run work:demo -- --agent --model-env .env.local
```

Use the existing provider settings: `AI_PROVIDER=openai` with
`OPENAI_API_KEY` or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`.
These are the two direct providers supported by the Work Lab; other provider
options in the main web agent do not automatically apply here.
`MODEL_ID` selects a model within the configured provider. Keep credentials
server-side and out of prompts, screenshots, recordings, and Git. A provider
API key alone does not establish permission to send patient data.

`--model-env` imports only the lab's allowlisted model settings. It does not
load application FHIR configuration or redirect chart access. If the model
settings are already in the process environment, omit `--model-env`. A failed
real provider request is reported as a failure; it does not silently become a
scripted success.

The default review UI is `http://127.0.0.1:3300`. The CLI uses local HAPI at
`http://127.0.0.1:8080/fhir` and refuses unavailable or incompatible servers.
The lab binds only to loopback and needs no Medplum credentials, public tunnel,
or Muse/Grok account. Do not expose its port publicly. The opt-in model call
does leave the machine: it includes your synthetic request and the bounded
invented chart fields returned by the read tool.

For a provider-free manual test client, use `npm run work:demo` without
`--agent`. That mode lets an operator enter a Task draft directly; it does not
interpret a natural-language work request. `--scripted-agent` is a separate,
test-only mode permitted with `NODE_ENV=test`. Its fixed model responses verify
the integration machinery and must not be presented as a real model run.

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

## Walk through assistant work

1. Open `http://127.0.0.1:3300/assistant` and connect with the assistant key.
   Check the displayed execution mode. In real agent mode, enter a synthetic
   request such as: “Review the selected result and draft a follow-up Task for
   the care team.” The assistant reads the allowed chart context and drafts
   the proposal. Save the run and Work IDs shown by the page.
2. In the separate human-owned browser/profile, open
   `http://127.0.0.1:3300/` and sign in with the reviewer key. Inspect the
   description, patient, reviewed source version, due date if supplied, and
   exact FHIR resource. Choose **Approve and save Task** or **Decline**.
3. Return to the Assistant page. It checks the durable work state while review
   is pending and reports the outcome. A confirmed save includes the Task ID
   and a verification receipt. Declined work shows no-write status. A model's
   draft or narration is never the evidence that a Task was saved.
4. Refresh or stop and restart the lab with the same store, reconnect, and
   retrieve the run or Work ID again. Startup checks interrupted commits. The
   reviewer can also choose **Reconcile interrupted saves**; that operation reads FHIR and never
   blindly creates a replacement Task.

To exercise both outcomes, submit a different second request and decline its
proposal. In manual mode, enter the Task description directly and submit it
for the same separate review process. Neither mode gives the assistant a tool
to approve or save its own proposal.

The [October 23 verification record](./evidence/assistant-work-2026-10-23.md)
documents the original manual-client milestone, independent FHIR reads, actual
process restarts, and its test limits. Scripted test results and real-provider
acceptance evidence must be identified separately.
The [real-provider assistant acceptance](./evidence/assistant-agent-2026-10-23.md)
records the subsequent Claude tool loop, separate test-reviewer decision,
verified FHIR Task, and automatic assistant outcome.

## Interface boundary

Assistant requests use the assistant Bearer credential. The browser reviewer
signs in separately and uses reviewer-only routes.

| Surface | Purpose |
| --- | --- |
| `GET /api/fixture` | Retrieve the one allowed synthetic patient/result pair and the assistant execution mode/model label. |
| `POST /api/assistant/runs` | Persist a synthetic natural-language request and start the configured assistant; requires an `idempotency-key` header. |
| `GET /api/assistant/runs` | List up to 100 recent runs for the lab assistant. |
| `GET /api/assistant/runs/:id` | Retrieve run progress and authoritative work state/receipt. |
| `POST /api/assistant/runs/:id/cancel` | Stop generation or cancel a proposal when its current state permits it. |
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

The run creation body is `{ "prompt": "<synthetic work request>" }`. The
response is `{ "run": ... }` with HTTP 202; model work continues after that
response. Reusing the same key and identical prompt returns the existing run.
A changed prompt with that key conflicts. Assistant run endpoints are disabled
in manual mode.

For a manual API caller, the following example uses `curl` and `jq`.
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

The same private SQLite file holds assistant requests and run progress in
`assistant_runs` alongside the synthetic proposal, its hash, role identifiers,
decisions, state, and commit receipt in `work_jobs`. Treat free-text requests
as stored content: enter invented data only.
The model receives a bounded projection from one validated fixture pair; it
cannot choose an arbitrary patient, resource, FHIR endpoint, or reviewer.

The lab resolves that fixture pair using marker identifiers
`synthetic-patient-v1` and `synthetic-result-v1`, verifies their
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

Model generation and the FHIR commit have different failure boundaries. A
provider failure or interrupted generation is not a committed Task. Once a
proposal exists, Last's durable work state and receipt determine the outcome,
including after the assistant page or lab process restarts. Do not infer a
save from a model's final sentence or replay a create to resolve uncertainty.

Run records expose the submitted prompt, configured model label, bounded
progress events, timestamps, and an attached work item when one exists. They
store no raw model narration or provider diagnostics. A run starts in
`generating`; after proposal submission its state follows the work item above.
Generation interrupted by shutdown/restart becomes `interrupted`. Submit a new
request to draft again if no proposal was prepared. If an exact proposal had
already been persisted, reading the run can recover its durable submission
with the same idempotency key; that action does not create a FHIR Task.

Only one generation runs at a time per lab process. Model generation has a
90-second limit, at most four model steps, no automatic provider retries, and
at most 1,200 output tokens per step. The model has only the fixed chart-read
and follow-up-proposal tools. The runtime does not supply reviewer keys or
sessions to the model.

## How this relates to MCP and agent frameworks

This lab exercises Last-owned work and review boundaries over a small local
HTTP API. It does not replace the published
[MCP server](./mcp.md) or implement MCP Tasks or A2A. Its API is a development
surface and can change.

The real assistant uses this repository's existing AI SDK stack and direct
configured model provider. Muse and Grok Bot connector tests, external OAuth,
MCP Tasks adapters, and an eve reference worker remain follow-up work. Passing
the lab's scripted tests does not prove any host's approval UI or patient-data
handling. The existing
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

The browser suite uses an explicitly scripted test model so CI needs no
provider secret. A passing scripted suite proves the exercised tool, review,
and FHIR persistence paths; it does not prove a real provider's tool calling.
Exercise `--agent` with your configured model separately to verify that path.

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
