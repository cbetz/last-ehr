# Adoption Metrics

Last EHR has two funnels that should be measured separately.

## OSS adoption funnel

Useful events:

- Demo started.
- Starter prompt clicked.
- First patient search completed.
- First chart opened.
- First approval card shown.
- First write approved or canceled.
- GitHub clicked.
- Docs clicked.
- Quickstart command copied, if a copy button is added later.

The goal is not raw traffic. The goal is more evaluators reaching the approval
moment and then successfully running the project locally.

### Instrumented demo milestones

Startup emits `demo_quickstart_started` once per mounted quickstart and
`demo_quickstart_ready` after the session endpoint returns a successful status.
Neither has properties. A successful session response does not prove FHIR
connectivity. Retrying does not create a second started milestone.

Startup failures use `demo_error_shown` with one static `category`:
`quickstart_rate_limited` (429), `quickstart_unavailable` (other unsuccessful
statuses), `quickstart_network` (request rejection), or `quickstart_timeout`
(15 seconds). Each category is emitted at most once per mount. These events
skip SMART sessions and the scripted local walkthrough, and require the
optional analytics configuration. Response bodies, status text, URLs, tokens,
and exception diagnostics are never included.

The demo emits these events only when the optional PostHog integration is
configured. One tracker lives in memory for each mounted chat; it deduplicates
streaming rerenders and skips SMART sessions.

| Event | Meaning | Properties |
| --- | --- | --- |
| `demo_ready` | The evaluation chat mounted. It does not prove backend connectivity. | None |
| `demo_first_tool_result` | First final successful result from an allowlisted tool. An empty read result can count; a preliminary result cannot. | Static `tool`, `kind` (`read` or `write`) |
| `demo_first_approval_shown` | First write tool in the SDK's approval-requested state. | Static `tool` |
| `demo_write_outcome` | A final tool outcome: `saved`, `canceled`, or `failed`. | Static `tool`, `outcome` |
| `demo_conversion_shown` | The local-install follow-up appeared after a confirmed save or cancellation. | None |
| `demo_conversion_clicked` | The visitor chose the local quickstart, source, or docs. | Static `target` |

`saved` requires an explicitly approved final result containing the expected
FHIR resource type, a valid returned ID, and a summary. It records the
server-confirmed create response, not an independent read from FHIR. IDs and
summaries are used only to recognize that result and never sent to analytics.
`canceled` requires a final SDK denial with the approval decision set to false.
Errors and invalid write results count as `failed`.

The older click events are now `demo_message_attempt` and
`demo_write_approval_attempt`. An attempt can fail before the session is ready
or a write completes; use outcome events when measuring completion.

The primary follow-up is **Run locally**, with source and docs as secondary
links. A click does not prove a completed installation. Confirm installation
in developer evaluation sessions; the local CLI sends no adoption telemetry.

## Hosted-interest funnel

Useful events:

- Waitlist form viewed.
- Waitlist form submitted.
- Referrer and landing page.

Keep this separate from OSS adoption. Someone joining a hosted waitlist is not
the same as someone who cloned the repo and verified the local demo.

## Privacy rules

- Never capture chart content.
- Never capture patient names, notes, observation values, or resource ids.
- Event properties should be names, booleans, counts, or static labels only.
