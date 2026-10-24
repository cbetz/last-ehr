# Synthetic demo recording

This standalone tool renders actual browser captures into an edited, sampled
90-second walkthrough. It does not automate the approval UI or invent frames.
The scripted local demo calls no external model. Its dependencies are separate
from the application workspace.

Use the [local quickstart](../../docs/quickstart.md) in a clean capture checkout.
Keep HAPI synthetic-only. Record native 1280 × 900 PNG/JPEG frames while
following the actual browser workflow. The October 23 recording uses clean
`f36d05dde21c6e1c6847f2660a966afd2615c646` / MCP `0.4.0`, independently of the
later onboarding patch. See its [capture notes](../../docs/evidence/demo-approval-2026-10-23.md).

From the renderer repository root:

```bash
npm --prefix tools/demo-video ci
```

Before submitting the first proposal, capture the baseline:

```bash
node tools/demo-video/proof.mjs snapshot \
  --phase baseline \
  --fhir-url http://127.0.0.1:8080/fhir \
  --output artifacts/demo-capture/proof.json \
  --source <full-source-commit> \
  --source-dir /absolute/clean-capture-checkout
```

Repeat with these phases at the corresponding UI states:

1. `pending`: first approval card waiting.
2. `approved`: approved save completed.
3. `second_pending`: second proposal waiting.
4. `canceled`: second proposal declined.

The GET-only helper verifies the clean source before and after each snapshot,
traverses FHIR searches with accurate totals, and checks IDs and stored
Observation fields. It accepts only a loopback synthetic FHIR endpoint and
does not persist unrelated resource contents or local checkout paths. A
failed snapshot leaves the previous report intact.

Create `artifacts/demo-capture/manifest.json` with `schemaVersion: 1`,
`width: 1280`, `height: 900`, `fps: 5`, `source.commit`, `source.packageVersion`,
and ordered `segments`. Each segment needs a distinct `id`,
`durationSeconds`, `caption`, `proofPhase`, and `frames` with absolute local
`path` and relative `atMs` values starting at zero. Durations must land on
frame boundaries and total exactly 90 seconds; all five proof phases must
appear in order. The last captured frame in a segment is held as needed.
An optional `source.reportUrl` must be HTTPS without credentials or a query.

```bash
node tools/demo-video/render.mjs \
  --manifest artifacts/demo-capture/manifest.json \
  --proof artifacts/demo-capture/proof.json \
  --check
```

Remove `--check` to render into `artifacts/demo-video`. Use `--prepare-studio`
to print the Studio command for validated captures. `--still-only` writes
preview artifacts under `artifacts/demo-video/preview`; `--poster-frame`
selects an actual output frame from 0–449.

Outputs include MP4, poster, WebVTT captions, proof, and a hash report. Review
the video and captions before publishing; the MP4 must remain below
15,000,000 bytes. Full renders stage their outputs before promotion and
write the render report last. Keep raw captures and temporary files under
ignored `artifacts/`; promote only reviewed outputs to `public/demo` and
`docs/evidence`. Commit the render report alongside the evidence so the
published MP4 can be checked against its SHA-256.

The recording demonstrates synthetic persistence and approval mechanics.
It does not establish clinical correctness, model quality, or production
authorization.

## Native Work MCP evidence walkthrough

The separate `render-work-mcp.mjs` renderer creates a 60-second, 1920 × 1080,
5 fps walkthrough of a recorded native Claude Code acceptance run. It uses
projected fields from actual client reports and one cropped reviewer-inbox
capture. Every scene labels this as an edited evidence walkthrough with
synthetic data and an automated test reviewer. It is not a continuous screen
recording, and it does not imply that a clinician reviewed the draft.

The renderer reads four existing files from `artifacts/work-lab`, regardless
of the caller's working directory: `claude-code-proposal.json`,
`claude-code-result.json`, `claude-code-fhir-proof.json`, and
`claude-code-reviewed.png`. The screenshot is decoded according to its actual
PNG/JPEG bytes, even if its filename uses a different extension. These inputs
must come from a completed acceptance run; missing evidence is never filled in.
The [committed acceptance bundle](../../docs/evidence/work-mcp-2026-10-23.md#walkthrough-and-reproduction)
includes commands to restore those four inputs and rerender this recorded run.

```bash
node tools/demo-video/render-work-mcp.mjs --check
node tools/demo-video/render-work-mcp.mjs
```

Validation requires the same durable Work ID and exact proposal hash in both
native reports, read/propose tools before review, `get_work` alone after
reconnection, a matching separate-reviewer decision, and a verified Task
receipt. The independent FHIR proof must record zero matching Tasks before
approval and one exact matching Task afterward. Its missing original
pre-approval snapshot timestamp remains explicitly disclosed. The renderer
validates this recorded proof; it does not query FHIR or rerun an assistant.

Outputs stay in ignored `artifacts/work-lab`: `work-mcp-walkthrough.mp4`,
`work-mcp-poster.png`, three representative scene PNGs, and
`work-mcp-render-report.json`. The report records SHA-256 hashes of all four
inputs, renderer sources, and output assets, plus independently inspected
encoded duration, dimensions, frame rate, and codec. Inspect all three scene
PNGs and the MP4 before publishing. The older 90-second recording and renderer
remain separate.
