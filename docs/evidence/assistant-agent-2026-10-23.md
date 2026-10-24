# Real-provider assistant work acceptance — October 23, 2026

[Projected acceptance report](./assistant-agent-2026-10-23.json)
· [Work Lab guide](../assistant-work.md)
· [PR #200](https://github.com/cbetz/last-ehr/pull/200)

This run exercised an actual Anthropic API model, `claude-sonnet-4-6`, in the
local synthetic Work Lab. The assistant read the allowed chart context,
drafted a follow-up Task, and submitted a durable proposal. After a separately
credentialed reviewer **API test role** approved it, Last independently read
FHIR and verified the exact saved Task. The assistant page reported that
authoritative result automatically, without a manual **Check status** action.

**Implementation:** [`64828fd`](https://github.com/cbetz/last-ehr/tree/64828fd7a2fbea24e4b0bc6ec92eb7d94f4c8f5e).
Acceptance ran against the working implementation for PR #200; this record does not describe the older
manual-only milestone or the published MCP package.

The run finished on **October 23, 2026 at 8:35:46 PM America/New_York**
(UTC−04:00). The report uses UTC, so its verification timestamp is
`2026-10-24T00:35:46.023Z`. The filename and heading use the local date.

## Observed path

| Step | Observed evidence |
| --- | --- |
| Browser request | A natural-language synthetic request was submitted through the assistant UI using computer-use automation. It requested care-team review by November 1, 2026, included the result and its date, and prohibited patient contact. |
| Model and chart read | Direct Anthropic API access used `claude-sonnet-4-6`. The model called `read_chart_context`; fresh local HAPI reads supplied the bounded invented Patient/Observation projection. The reviewed result was synthetic HbA1c **6.4%**, dated January 1, 2026. |
| Draft and proposal | The model called `propose_follow_up`, citing `Observation/1001`, version `1`. Last persisted the draft and proposal hash before reporting pending review. An independent FHIR identifier search found **zero Tasks** for that work item before approval. |
| Review decision | A separate reviewer credential established the reviewer session and approved the exact proposal hash through the API. This was an automated test role, not evidence of a real human or clinical reviewer identity. The model had no reviewer credential or decision tool. |
| Verified persistence | A direct HAPI identifier search found **one Task**, `Task/1021`, version `1`. The resource matched the exact approved proposal, including description, patient/source association, reviewed source-version input, and due date `2026-11-01`. |
| Assistant outcome | The UI's polling showed the saved state and verified receipt automatically. Its completion message explained that a requested follow-up was recorded and did not claim that the patient had been contacted. |
| Real-provider worker restart | After this completed run, the worker was stopped and restarted with the same private store. Retrieving the same run retained its work ID and verified receipt without an additional model request. This check covered a completed real-provider run, not a crash during its model generation. |

The model drafted:

> Care team review requested: Patient Alex Synthetic Worklab has a synthetic
> HbA1c result of 6.4% dated January 1, 2026. Please review this result and
> determine any appropriate next steps. Do not contact the patient at this time.

The run ID was `acc545ec-ad8b-4bc7-8e0c-c52ec03fb1f2`, and the durable work ID
was `372b0a27-d517-4717-ae93-34748427460e`. The approved proposal hash was
`e508ef306ee5191ac8c714da81edf69fa2a47d0221c6805c4a6d72d0c702f21b`.
These are disposable synthetic identifiers, not stable fixture IDs for another
installation. The projected report contains no credentials or raw provider
diagnostics.

## Other test evidence and its limits

The deterministic test model is separate from this real-provider acceptance.
It needs no provider secret and is explicitly labeled scripted. The automated
suite exercises approval and denial, separate browser contexts, cancellation,
bounded model failures, and interrupted/lost-response recovery. Its restart
tests use scripted generation with real local HAPI persistence. Those results
must not be described as additional Claude acceptance runs or genuine human
review.

Final local verification passed **77 focused unit/API tests**, **6 actual HAPI
integration tests**, and **4 browser tests**. The full default repository suite
passed **708 tests**, with **10 integration-gated tests skipped**. TypeScript
and the production build passed. Lint passed with existing warnings in
unrelated components. The real-provider acceptance above was run separately
from these deterministic suites.

The earlier [manual-client verification record](./assistant-work-2026-10-23.md)
remains a historical milestone with its original counts and scope. This real
assistant path does not change the older scripted MCP demo or its release
pins.

## Reproduce with invented data

Follow the [Work Lab setup](../assistant-work.md), then explicitly enable a
supported direct provider with your own API key:

```bash
npm run work:demo -- --agent --model-env .env.local
```

Connect the assistant page with its lab key and submit a synthetic work
request. Review the exact proposal in a separate human-owned browser/profile,
approve or decline it, and independently query local FHIR using the returned
work identifier. The guide documents the role boundaries and recovery steps.
A failed provider request must remain a failure, without scripted fallback.

This acceptance used only invented data on loopback. It proves one bounded
real-model draft and verified FHIR save. It does not prove clinical correctness,
actual human presence, production authentication/authorization, arbitrary
assistant-host compatibility, or HIPAA readiness. Muse, Grok Bot, eve, MCP
Tasks, and A2A were not connected. No patient was contacted and no clinical
follow-up was performed. Real model mode sends the request and synthetic chart
projection to the selected provider; **PHI is not permitted**.
