# Synthetic browser approval recording — October 23, 2026

[90-second MP4](https://www.lastehr.com/demo/approve-and-decline.mp4)
· [projected FHIR proof](./demo-approval-2026-10-23.json)
· [transcript](../quickstart.md#recorded-approval-and-cancellation)

The app ran from a clean, detached checkout of
`f36d05dde21c6e1c6847f2660a966afd2615c646` (`mcp-v0.4.0`). A separate, disposable
Docker Compose project used HAPI FHIR v8.10.0-2 and Postgres 17 on loopback.
Its four synthetic fixture patients were seeded before capture. No normal
deployment configuration was copied into that checkout.

The app was built with `FHIR_BACKEND=hapi`,
`FHIR_BASE_URL=http://127.0.0.1:8080/fhir`, `AI_PROVIDER=scripted`,
`LASTEHR_SCRIPTED_DEMO=true`, `NEXT_PUBLIC_QUICKSTART=true`, and
`NEXT_PUBLIC_SCRIPTED_DEMO=true`. It ran as a production Next.js build on
localhost. External model and analytics configuration was absent.

The recording uses actual 1280 × 900 browser screenshots, sampled around the
observed interactions and edited into a 1920 × 1080, 5 fps, 90-second MP4.
Frames are held for readability. The adjoining verification pane renders the
last selected direct FHIR snapshot; it is not a live browser or a statement
that every frame and GET occurred simultaneously. There is no external model
call, narration, generated app UI, or simulated FHIR response.

## Independent reads

The GET-only helper resolves the fixture by its static identifier
`https://lastehr.com/synthetic|synthetic-004`, then queries every Observation
for that patient with `_count=1&_total=accurate`. It follows same-origin
pagination, checks accurate totals against unique match IDs, and verifies the
clean source checkout before and after each snapshot. A single quiet local
store was used; no other writer ran during the workflow.

| Snapshot | Observation IDs / pages | Difference |
| --- | --- | --- |
| Unapproved baseline | 7 / 7 | Original ID set |
| First proposal waiting | 7 / 7 | Same baseline IDs |
| After approval | 8 / 8 | Exactly one added ID, none removed |
| Second proposal waiting | 8 / 8 | Same approved-state IDs |
| After cancellation | 8 / 8 | Same approved-state IDs |

The final take followed helper review and a fresh reset of the disposable
synthetic stack. Its baseline was captured before submitting the first
proposal, followed by a separate pending-state read before approval. No
product source or helper behavior changed during this final take.

The new resource is `Observation/1154`, with subject `Patient/1137`, status
`final`, quantity `72 bpm`, UCUM `/min`, LOINC `8867-4`, and the `AIAST` security
label in `http://terminology.hl7.org/CodeSystem/v3-ObservationValue`. IDs are
disposable synthetic values and will differ on another stack. The projected
report omits unrelated chart contents, personal contact details, credentials,
and local filesystem paths.

The companion render report records the source, input hashes, output geometry,
and MP4 SHA-256. The FHIR report is also served beside the video. See
[`tools/demo-video`](../../tools/demo-video/README.md) for the helper and
renderer workflow.

## Limits

This demonstrates one fixed browser approval and cancellation against local
synthetic HAPI FHIR. It does not evaluate a model, arbitrary prompts, clinical
correctness, real reviewer identity, concurrent writers, hosted Medplum, or
production authorization. The separate [MCP conformance guide](../conformance.md)
and [remote MCP report](./remote-mcp-2026-10-22.json) cover other test scenarios
and have their own limits. No evaluator sessions or outreach were performed
as part of this recording.
