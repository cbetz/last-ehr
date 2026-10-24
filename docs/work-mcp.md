# Work MCP Connector

The Work MCP connector lets an external assistant read one invented chart,
submit a follow-up Task for separate review, disconnect, and later retrieve
the durable outcome. Last owns the proposal, reviewer decision, FHIR commit,
and verified receipt. The assistant cannot approve its own work.

This is a **checkout-only, local, synthetic-data experiment**. It connects a
stdio MCP client to the [Assistant Work Lab](./assistant-work.md) over numeric
loopback HTTP. It is separate from the published `@lastehr/mcp` `0.4.1` package
and the [remote OAuth MCP server](./remote-mcp.md). It does not implement the MCP
Tasks extension: the client calls ordinary tools and retains Last's Work ID.

A saved FHIR Task records requested work. It does not mean a patient was
contacted or the follow-up was completed. Use invented data only, including
in prompts and Task descriptions. Review happens after the assistant has read
the synthetic chart; a later approval is not permission for an earlier data
disclosure.

Watch the [60-second native-client walkthrough](/demo/work-mcp-walkthrough.mp4)
with [captions](/demo/work-mcp-walkthrough.vtt). It combines recorded client
reports and an actual reviewer-inbox capture; it is edited, uses synthetic
data, and labels the automated test reviewer. The
[acceptance record](./evidence/work-mcp-2026-10-23.md) includes the underlying
reports, independent FHIR assertions, and reproduction steps.

## Start the local lab

Use Node `22.18.0` from `.nvmrc`, npm, and Docker with Compose. From a clean
checkout:

```bash
nvm use
npm ci
docker compose -p lastehr-work-lab up -d
FHIR_BACKEND=hapi HAPI_BASE_URL=http://127.0.0.1:8080/fhir npm run fhir:wait
npm run work:demo
```

If a repository-managed HAPI stack already occupies port 8080, use that stack
instead of starting another one. The Work Lab verifies and selects its own
exact invented Patient/Observation pair; do not reset another evaluator's
FHIR data to make room for it.

Default manual mode is sufficient: the external MCP client supplies the
assistant. The lab needs no model API key in this mode. To use its separate
built-in assistant page as well, follow the opt-in provider setup in the
[Work Lab guide](./assistant-work.md).

Keep the Work Lab terminal running. It prints a local assistant key and a
different reviewer key. The review inbox is `http://127.0.0.1:3300/`; the
default durable store is `.lastehr/work-lab/work.sqlite`. Preserve that store
and configure the same distinct role keys when restarting if you want to
resume a previous Work ID. The lab supports `--port` and `--store`; see
`npm run work:demo -- --help` for the full options and private-store rules.

The FHIR server and Work Lab remain local. Do not expose them through a public
tunnel or treat these disposable keys as production workforce identities.

## Connect an external assistant

In a separate assistant terminal, make only the assistant key available as
`LASTEHR_WORK_ASSISTANT_KEY`. This hidden-input command works in Bash and Zsh
and keeps the pasted value out of shell history:

```bash
IFS= read -r -s LASTEHR_WORK_ASSISTANT_KEY
export LASTEHR_WORK_ASSISTANT_KEY
```

Paste the assistant key from the local lab terminal, then press Enter. Keep
the reviewer key out of this terminal, the MCP client's environment, its
conversation, and its tool configuration. Use a separate human-owned browser
or profile for the reviewer inbox. An assistant controlling a signed-in
reviewer's browser could act through that session even without reading its
HttpOnly cookie.

Generate the client configuration:

```bash
npm run --silent work:mcp -- --print-config
```

The `last-work` entry starts the checkout's stdio server with the checkout's
Node runtime and absolute paths. It contains no assistant key; the server
reads `LASTEHR_WORK_ASSISTANT_KEY` from its process environment. Generate it
again after moving the checkout or changing the Node installation.
Use `--print-config --url http://127.0.0.1:3302` if the Work Lab runs on a
different allowed port. Start the printed command and argument list directly
from the MCP host; ordinary npm status banners would corrupt a stdio MCP
protocol stream.

Your external client uses its own model account and may send synthetic tool
results to that provider. The connector does not load `.env.local` or use
model-provider or reviewer credentials. MCP hosts can inherit environment
variables into their child processes, so an `env` block in a client config
does not isolate the connector from other credentials present in the host's
environment. Keep the reviewer credential in its separate local lab/reviewer
session.

### Run with Claude Code

The checkout includes a narrow runner for the installed `claude` CLI. It uses
direct Anthropic API authentication; configure `ANTHROPIC_API_KEY` and
`MODEL_ID` in your private `.env.local`. The runner reads only those two
settings from that file. Keep `LASTEHR_WORK_ASSISTANT_KEY` in the assistant
terminal's environment as above.

```bash
npm run work:claude -- --request 'Draft a follow-up Task for the care team to review the selected synthetic result.' --idempotency-key care-team-review-001 --model-env .env.local
```

Every request requires an `--idempotency-key`. Save that attempt key and reuse
it if the submission outcome is uncertain. Use a new key for separate work.

This starts a standalone Claude Code client with the four Work MCP tools and
no built-in shell, file, browser, or other tools. Its private temporary home
and working directory keep checkout instructions, user MCP configuration,
session history, and project files out of that run. Its MCP child configuration
clears known model-provider and reviewer credential variables; only the
assistant key is used to access Last. The model client itself still receives
its Anthropic API credential. A run has a 120-second timeout and a $1 budget
cap.

The client returns the proposal's Work ID and exits before review. Approve or
decline in the separate reviewer browser, then start a new client process:

```bash
npm run work:claude -- --status WORK_ID_FROM_PREVIOUS_RUN --model-env .env.local
```

Replace `WORK_ID_FROM_PREVIOUS_RUN` with the UUID returned by the proposal.
The second process checks durable status by ID without restoring the first
conversation or submitting another proposal. The runner does not save the raw
model transcript. Its optional `--report` writes a bounded outcome report;
see `npm run work:claude -- --help` for options.

If a request times out before returning a Work ID, recover the existing
proposal's ID from the reviewer inbox and use `--status`. If you retry the
request, retain its original idempotency key. An identically regenerated
proposal returns the original work; a changed draft conflicts instead of
creating another proposal. Do not change keys to work around that conflict
while the earlier submission's outcome is unknown.

The [October 23 connector acceptance record](./evidence/work-mcp-2026-10-23.md)
documents a real Claude Code `2.1.308` client reading and proposing, exiting
before a separate test-reviewer browser approved, and a fresh client process
retrieving the same Work ID and verified Task receipt. The independent FHIR
check found exactly one matching Task. This is evidence for that local native
client configuration; it does not establish Muse, Grok Bot, eve, or clinical
deployment compatibility.

## Use the work tools

The MCP server identifies itself as `lastehr-synthetic-work-lab` and exposes
exactly these tools:

| Tool | Purpose |
| --- | --- |
| `read_work_context` | Read the one allowed synthetic Patient/Observation projection and its source version. |
| `propose_work` | Submit a description and optional due date against that exact source version, using a caller-chosen idempotency key. |
| `get_work` | Retrieve a Work ID's current state and any verified FHIR receipt, including after reconnecting. |
| `cancel_work` | Cancel a pending proposal when its current state permits cancellation. |

There is no approval, FHIR create, delete, arbitrary chart search, backend URL,
or reviewer login tool. The selected patient comes from Last's bounded chart
read; the assistant does not supply a patient ID to `propose_work`.
This interface needs ordinary stdio MCP tools, without a host elicitation
capability; review takes place in Last's separate browser inbox.

Ask the external assistant:

> Read the allowed synthetic chart with Last's work tools. Draft a follow-up
> Task for the care team to review the selected result. Submit it for separate
> review, then return its Work ID and stop. Do not claim that it was saved.

`propose_work` takes `description`, `sourceReference`, `sourceVersionId`,
`idempotencyKey`, and optional `dueDate`. Read context first in the same MCP
connection and copy the source reference and version exactly. `dueDate` is a
valid calendar date in `YYYY-MM-DD` form. Descriptions are limited to 2,000
characters. The idempotency key is 1–128 letters, digits, `.`, `_`, `:`, or
`-`. Reuse the same key only for an identical proposal retry; changed content
with the same key conflicts. Use a fresh key for separate work.

In the separate reviewer browser, sign in at `http://127.0.0.1:3300/` with the
reviewer key. Inspect the exact Task, source version, and proposal hash, then
approve or decline. Approval starts the conditional FHIR commit and independent
read-back check. Declining does not start a Task commit.

Reconnect the external assistant if needed and ask:

> Use Last's `get_work` tool to check Work ID `<the saved Work ID>`. Report the
> authoritative state and verified Task receipt. Do not submit another draft.

`get_work` and `cancel_work` need only the Work ID; they do not require another
chart read. Last's SQLite state survives client disconnects and lab restarts
with the same store. The connector itself keeps no proposal database.

## Interpret the result

| State | Meaning |
| --- | --- |
| `awaiting_review` | A durable proposal exists; no commit has started. |
| `committing` | Review approved the proposal and its save is in progress. |
| `succeeded` | Last independently found the exact reviewed Task in FHIR and returned its verification receipt. |
| `denied`, `cancelled`, `expired` | The pending proposal closed without starting a commit. |
| `failed` | Last could not complete the approved operation; inspect its bounded failure code. |
| `needs_reconciliation` | The commit outcome is uncertain; a confirmed save has not been established. |

Only `succeeded` with its receipt establishes a verified save. A model's final
sentence, successful proposal submission, or cancellation request does not.
The connector validates the proposal hash, decision, source linkage, and
receipt shape before returning a successful result; Last remains responsible
for the FHIR verification itself.

If a submit response is lost, retry the exact proposal and idempotency key.
If a commit response is uncertain, check the existing Work ID. Restarting the
lab or using **Reconcile interrupted saves** in the reviewer inbox searches
FHIR before reporting an outcome; it does not blindly create another Task.
Cancellation cannot undo a commit that has already started.

## Interface and verification limits

The connector uses assistant Bearer authentication with
`GET /api/work/context`, `POST /api/work`, `GET /api/work/:id`, and
`POST /api/work/:id/cancel`. It accepts only explicit numeric IPv4 loopback
Work Lab URLs, uses bounded requests/responses, refuses redirects, and never
forwards upstream error bodies to the model.

This local path does not establish hosted Medplum support, remote MCP access,
production user authentication, verified human reviewer identity, clinical
workflow completion, or HIPAA readiness. Muse, Grok Bot, eve, and other clients
need individual integration tests before compatibility claims. See the
[HIPAA deployment groundwork](./hipaa-deployment.md) for the separate data,
service agreement, and operating questions that remain before a clinical pilot.

The published [`@lastehr/mcp` guide](./mcp.md) describes a different interface:
bounded chart reads and opt-in writes whose approval uses a client's MCP
elicitation flow. Its [remote transport](./remote-mcp.md) adds per-caller OAuth
and FHIR credentials. Neither feature is implied by this Work Lab connector.
