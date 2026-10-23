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
