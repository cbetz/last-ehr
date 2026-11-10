# Synthetic browser approval recording — November 6, 2026

[90-second MP4](https://www.lastehr.com/demo/approve-and-decline.mp4)
· [projected FHIR proof](./demo-approval-2026-11-06.json)
· [transcript](../quickstart.md#recorded-approval-and-cancellation)

The app ran from a clean checkout of
`fb2473246c5900ec8e714358dacb36a3167d4602`, git tag `mcp-v0.5.1`.
`@lastehr/mcp@0.5.1` is published on npm. The local stack was this
repository's Compose file: HAPI FHIR
`v8.10.0-2` and Postgres 17, bound to loopback. Its four synthetic fixture
patients were seeded before capture. No deployment configuration was copied
in.

The app was built with `FHIR_BACKEND=hapi`,
`FHIR_BASE_URL=http://127.0.0.1:8080/fhir`, `AI_PROVIDER=scripted`,
`LASTEHR_SCRIPTED_DEMO=true`, `NEXT_PUBLIC_QUICKSTART=true`,
`NEXT_PUBLIC_SCRIPTED_DEMO=true`, and `NEXT_PUBLIC_DEMO_DEV_OUTPUT=true`. It
ran as a production Next.js build on localhost. External model and analytics
configuration was absent.

The recording uses actual 1280 × 900 browser screenshots, sampled around the
observed interactions and edited into a 1920 × 1080, 5 fps, 90-second MP4.
Frames are held for readability. The adjoining verification pane renders the
last selected direct FHIR snapshot; it is not a live browser or a statement
that every frame and GET occurred simultaneously. There is no external model
call, narration, generated app UI, or simulated FHIR response.

The public MP4 SHA-256 is
`c847e84100704e99a02aa413705e341c51d7f557451427dcbbb45b033801cfd6`
(1,595,172 bytes). The companion render report records the same hash.

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

The baseline was captured before submitting the first proposal, followed by a
separate pending-state read before approval. No product source changed during
this take.

The new resource is `Observation/1076`, with subject `Patient/1059`, status
`final`, quantity `72 bpm`, UCUM `/min`, LOINC `8867-4`, and the `AIAST`
security label in `http://terminology.hl7.org/CodeSystem/v3-ObservationValue`.
IDs are disposable synthetic values and will differ on another stack. The
projected report omits unrelated chart contents, personal contact details,
credentials, and local filesystem paths.

The companion render report records the source, input hashes, output geometry,
and MP4 SHA-256. The FHIR report is also served beside the video. See
[`tools/demo-video`](../../tools/demo-video/README.md) for the helper and
renderer workflow.

The October 23 take, from `f36d05d` / MCP `0.4.0`, remains in
[its notes](./demo-approval-2026-10-23.md). It is not the file now published
next to the video.

## Limits

This demonstrates one fixed browser approval and cancellation against local
synthetic HAPI FHIR. It does not evaluate a model, arbitrary prompts, clinical
correctness, real reviewer identity, concurrent writers, hosted Medplum, or
production authorization. The separate [MCP conformance guide](../conformance.md)
covers other test scenarios and has its own limits. No evaluator sessions or
outreach were performed as part of this recording.
