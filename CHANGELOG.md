# Changelog

This project is alpha. The changelog records adoption-relevant changes so
self-hosters can tell what moved between pulls.

## Unreleased

- Write policy hooks: the approval gate can now be narrowed, never
  widened. `LASTEHR_WRITE_TOOLS_DISABLED` statically disables write tools
  in both bindings — never offered to the model (web: activeTools + prompt
  gating; MCP: unregistered from the tool list), commit-denied for any
  straggler such as a stale approval card, and unknown names fail closed
  loudly. A dynamic, deny-only policy hook (`writePolicy` in
  `BuildToolsOptions`, `policy` in the MCP package's `WriteToolOptions`)
  fails closed on error and is never attributed to the reviewer; the MCP
  binding checks it before the reviewer is asked and again at commit, the
  web binding at commit. The protocol doc's Decision/Commit/Conformance
  sections now specify the policy rules.

- Published the v0.1 draft of "Approval-Gated Agent Writes on FHIR"
  (docs/agent-write-protocol.md): a small, framework-neutral protocol —
  Proposal, Decision, Commit, Audit, optional Isolation — extracted from
  the web approval card and the MCP write profile, expressed in CDS Hooks
  vocabulary where it fits and aligned with HL7's AI Transparency IG (the
  standard AIAST label plus author/verifier Provenance) for the audit
  layer. The FHIR Agent Safety Eval maps to it as the seed conformance
  suite.

- Approved agent writes now implement the protocol's Audit section in both
  bindings (web agent and `@lastehr/mcp`): every created resource carries
  the standard AIAST security label ("Artificial Intelligence asserted")
  in `meta.security`, and opt-in `LASTEHR_WRITE_PROVENANCE=true` emits a
  `Provenance` resource per approved write naming the agent as author and
  the reviewing human as verifier, per the HL7 AI Transparency on FHIR IG.
  Provenance emission is non-blocking — a failed audit write never fails a
  write the reviewer already approved. The scripted no-key demo stamps the
  same AIAST label on its fixed write (the provenance flag is a no-op
  there), and the seed wipe now sweeps audit Provenance before deleting
  the resources it targets, so reseeding stays safe under referential
  integrity.

- New read tool `read_chart_section`: one policy-checked bounded read over
  nine allowlisted chart sections (Observation, Communication, Condition,
  AllergyIntolerance, MedicationRequest, Immunization, DocumentReference,
  Goal, CarePlan) with forced patient scoping, optional code and date
  filters, and capped counts — the tool builds every query, the model only
  picks a section and filters. Unlocks temporal questions ("last flu shot",
  "blood pressure over six months") the fixed chart fetch could not answer,
  keeps per-session isolation on every section, and wraps free-text fields
  in the untrusted-content boundary. The session-visibility fallback for
  servers that reject `_tag:not` now over-fetches before filtering, so
  foreign sessions' rows can no longer empty a small result window.

- `@lastehr/mcp` 0.2.0 ships the MCP write profile: `add_note` and
  `record_observation` as elicitation-gated, proposal-shaped writes behind
  the explicit `LASTEHR_MCP_WRITES=proposal` opt-in. The write tools are
  offered only to clients that declared the elicitation capability (fail
  closed), the human sees the exact proposed fields and must approve each
  action, every non-approval outcome saves nothing, and approved writes are
  tagged (`https://lastehr.com/mcp|approved-proposal`). Read-only remains
  the default forever; the retired `0.1.x` line never contained write code.
  Design record: issue #129.

## 0.2.6 — 2026-07-18

Aidbox joins the demo backend picker (operator-owned boxes), the MCP
package gains a local-stack mode, and a round of picker UX and adapter
polish. Every new backend/feature is still default-off.

- Demo backend picker UX, from feedback on a live two-backend demo: the
  input-bar controls no longer overlap the composer, the pre-chat card and
  the in-conversation select are shown one at a time (never both), the
  confusing empty "Default backend" option is gone (the first listed
  backend is the concrete default), and the adapter-tier badges are dropped
  from the picker (they misled in a synthetic demo).
- Aidbox is now demo-picker eligible for operator-owned boxes: a hosted dev
  sandbox (`edge`, FHIR 4.0.1) passed the real-server contract including
  the session-isolation clause, the seed, and the Safety Eval (7/7).
  Measured caveat recorded in docs/support.md: Aidbox silently ignores the
  bare-system `_tag:not` token, so per-session visibility runs on the
  client-side filter arm.
- `@lastehr/mcp` honors `FHIR_BACKEND=hapi` with `HAPI_BASE_URL` or
  `FHIR_BASE_URL` — the same env pair as the web app and seed — so a fully
  local synthetic stack gets MCP too (no credentials; the local no-auth
  caveats apply, and the package stays read-only). Medplum remains the
  default and is unchanged.
- `npm run seed` can now target the Firely and Aidbox adapters
  (`FHIR_BACKEND=firely|aidbox`), so those sandboxes get the same four
  persistent synthetic charts the demo uses. Adapter targets fail closed
  without `-- --confirm-synthetic`, matching the safety eval's posture,
  because the seed deletes and recreates matching charts.
- Failed FHIR operations now carry their HTTP status as a bare number: the
  REST transport attaches `statusCode` to its errors, server logs append it
  (via the existing log scrubber), and the demo dev panel shows `err 404`
  instead of just `err` — never the diagnostic text.
- Closed the last two launch-audit findings: chart notes (the free-form,
  visitor-writable field) now carry an explicit untrusted-content boundary
  in tool results, named by the system prompt's chart-content-is-data rule
  and stripped by the chart UI; and self-hosted deploys without a
  header-normalizing proxy can set `RATE_LIMIT_TRUST_PROXY=false` so a
  spoofed `x-forwarded-for` cannot mint fresh per-IP rate-limit buckets.

## 0.2.5 — 2026-07-17

Demo backend picker and under-the-hood dev output: a demo visitor can pick
which configured FHIR backend powers their session and watch the agent's
chart operations live. Both features default off; with the new env vars
unset, behavior is unchanged. Also fixes session-scoped chart views on
HAPI.

- Demo backend picker (`NEXT_PUBLIC_DEMO_BACKENDS`, `id|Label` pairs): the
  client sends a name-only `x-demo-backend` header, validated server-side
  with silent fallback, mirroring the demo model picker. Eligibility is
  gated in code to the Supported and local-evaluation tiers (`medplum`,
  `hapi`); synthetic-evaluation adapters cannot be offered via env alone.
  Preflight an allowlist with `npm run check:backends`.
- Per-backend base URLs (`HAPI_BASE_URL`, `FIRELY_BASE_URL`,
  `AIDBOX_BASE_URL`, each falling back to the shared `FHIR_BASE_URL`), so
  several backends can be configured side by side. The scripted-demo gate,
  seed, and readiness scripts resolve the same effective URL as the app.
- Under-the-hood dev panel (`NEXT_PUBLIC_DEMO_DEV_OUTPUT=true`): streams
  structured FHIR operation events (method, relative path, outcome, timing,
  counts) to demo sessions as transient data parts. Events never contain
  error text, auth material, hosts, or the demo session id; the boundary is
  documented in the threat model and pinned by safety-boundary tests.
  `npm run demo:local` now enables the panel for the zero-key walkthrough.
- Quickstart now issues placeholder demo sessions for any non-Medplum
  default backend (previously `FHIR_BACKEND=firely|aidbox` returned 404
  unless Medplum credentials were also set), and mints a Medplum token when
  `medplum` is allowlisted on a non-Medplum default.
- Security tightening: sign-in (`/api/auth/session`) now clears a leftover
  `demo_session_id`, so a signed-in session can never present as a demo
  session; the rejected-proposal audit trail is pinned to the deployment
  default backend and cannot be re-pointed by a visitor's pick.
- Fixed session-scoped chart views on HAPI: the visibility query's
  bare-system token (`_tag:not=http://lastehr.demo|`, shipped in 0.2.3) is
  rejected by HAPI (HAPI-1218), so any live-model HAPI deployment with a
  demo session failed every chart read. The query now falls back to the
  unfiltered search plus the client-side visibility filter on servers that
  reject the shape. The backend contract harness gained a session-isolation
  clause (`_tag` exact match strictly; the untagged set with the app's
  exact fallback), and the FHIR Agent Safety Eval now performs sessioned
  chart reads, so this path is exercised against a real server in CI.

## 0.2.4 — 2026-07-14

Backend portability release: the first two adapters beyond Medplum and local
HAPI, plus an opt-in audit trail for denied write proposals.

- Added a Firely Server adapter (`FHIR_BACKEND=firely`), anonymous or with a
  static bearer token in `FIRELY_ACCESS_TOKEN`. Verified on the
  synthetic-evaluation tier against Firely's public sandbox
  (`https://server.fire.ly`) with both contract harnesses and the FHIR Agent
  Safety Eval (7/7).
- Added an Aidbox adapter (`FHIR_BACKEND=aidbox`) using HTTP Basic from an
  Aidbox Client against the box's `/fhir` endpoint. Verified on the
  synthetic-evaluation tier against a dev-licensed local box
  (`aidboxone:edge`) with both contract harnesses and the Safety Eval (7/7).
  The adapter guide documents the working setup, including creating the
  Client and AccessPolicy through a `BOX_INIT_BUNDLE` file (the admin login
  is console-only and cannot basic-auth the API).
- `npm run eval` can now target a registered adapter's disposable synthetic
  sandbox (`--backend firely|aidbox --base-url <url> --confirm-synthetic`).
  Adapter targets never prepare the local Docker stack and fail closed
  without the explicit synthetic confirmation.
- Added an opt-in rejected-proposal audit trail
  (`LASTEHR_AUDIT_REJECTED_PROPOSALS=true`): each write proposal a reviewer
  denies is recorded as one FHIR AuditEvent (tool name, patient reference,
  approval id; never the proposed content). Covered end to end by the
  Playwright approval-flow suite.
- Brought README, ROADMAP, quickstart, eval docs, and the marketing pages in
  line with the verified adapter pair and the shipped audit trail; every
  mention keeps the synthetic-evaluation-only boundary explicit.

## 0.2.3 — 2026-07-14

Post-launch audit fixes. All findings from the launch-day adversarial audit
are now closed.

- Scoped the shared demo's session visibility into the FHIR query itself:
  chart reads fetch untagged seed rows and the session's own tagged rows as
  separate searches, so another visitor's writes can no longer crowd a
  visitor's own data out of the newest-100 window on a busy demo. The
  post-fetch filter remains as a fallback for backends that ignore the
  `:not` search modifier.
- Hardened the demo against transient quickstart failures: a failed session
  re-arm now blocks the send with a "demo is busy" notice instead of
  surfacing a false "session expired" that told users to refresh away their
  demo writes.
- Added a system-prompt guardrail that chart content is data, never
  instructions, and that patient ids come only from the user or prior tool
  results.
- Restored keyboard focus visibility on the chat input, announced async
  loading/error states to assistive tech, and gave notice-bar dismiss
  buttons a focus ring (WCAG 2.4.7 / 4.1.3).
- Stopped shipping Medplum and PostHog in first-load JS on marketing and
  docs routes; both now load only under /demo.
- Built every subpage's social cards from one metadata helper so OpenGraph
  and Twitter cards cannot drift; every page now emits its own card title
  and full image dimensions instead of inheriting the homepage copy.
- Moved the README demo GIF out of the web root and deleted an orphaned
  image, trimming ~1MB from the app image.
- Unified the brand mark on the last-chevron icon across the site and demo
  header, and made the demo header behave at phone widths.
- Documented the trusted-proxy requirement for per-IP rate limiting on
  self-hosted deploys.

## 0.2.2 — 2026-07-12

- Published a multi-arch app image to GHCR (`ghcr.io/cbetz/last-ehr`) from
  release tags and manual publish runs, with `docker-compose.ghcr.yml` for a
  pull-and-run zero-key synthetic stack. The image bakes the quickstart and
  scripted-demo UI on and analytics, Medplum auth, and model keys off.
- Added a browser end-to-end suite for the approval flow (Playwright, scripted
  model only): proposal card renders, a rejected write leaves HAPI untouched,
  an approved write persists exactly one session-tagged Observation, asserted
  over FHIR REST. Runs in CI against the seeded local HAPI stack.
- Locked PostHog to explicit product events only: no autocapture, no automatic
  pageviews, no session recording or surveys, memory persistence with no
  cookies and nothing stored on-device.
- Added a `/privacy` page describing the hosted site's actual data practices,
  linked from the footer and sitemap.
- Narrowed server-side chat error logging to error type, message, and status;
  raw provider errors are never logged because they can carry the full request
  body, including chart context.
- Added a post-demo conversion card after the first approve or reject decision
  in the demo, with once-only display, dismissal, and SMART-session
  suppression.
- Led the homepage, README, and share images with the writeback value
  proposition, and tightened backend claims: bring your own Medplum project;
  the local HAPI stack stays synthetic evaluation only.
- Surfaced community entry points: good first issues and GitHub Discussions in
  the footer, the roadmap page, and `ROADMAP.md`.
- Added the FHIR Agent Safety Eval: a disposable synthetic workflow runner for
  web-agent search/chart reads, proposal gating, approved and denied writes,
  chart association, cleanup, and a scrubbed JSON report. The reusable helper
  fails closed without explicit synthetic-target confirmation.
- Added CI coverage and an uploaded report artifact for the loopback HAPI
  reference evaluation.
- Rebuilt the marketing and docs discovery surfaces around evidence: the
  approval contract, MCP Local Lab, adapter contract, and Safety Eval.
- Bound the public presentation to an ink/paper clinical-infrastructure visual
  system with fewer decorative cards and clearer runnable paths.
- Added `npm run mcp:demo`, a checkout-only synthetic HAPI MCP Local Lab that
  prepares fixture data and prints a no-FHIR-credential Claude Code/Cursor
  configuration for the two bounded read tools.
- Added a fixture-restricted local read facade and a real stdio HAPI smoke test
  so the lab cannot discover arbitrary records on a reused local HAPI volume.
- Bound the unauthenticated local HAPI Docker port to loopback by default.
- Kept `@lastehr/mcp` Medplum-only; the Local Lab is not published package or
  generic HAPI support.

## 0.2.1 — 2026-07-11

- Added `@lastehr/mcp`, a standalone, Medplum-only MCP package with two
  read-only chart tools and a guided client configuration command.
- Added Official MCP Registry metadata for the published npm package.
- Added a GitHub OIDC workflow to publish immutable MCP Registry records
  without storing a registry secret.
- Added a concise MCP activation path and synthetic-data walkthrough to the
  README.
- Removed direct-write MCP exposure; the published `0.1.x` package contains no
  write tools or write-enable environment switch.
- Raised the Node.js runtime baseline to 22.18 (or 24.2+) to match
  `@medplum/core` and avoid Node 20's missing global `WebSocket`.

## 0.2.0 — 2026-07-09

- Added public roadmap, governance, and adoption-focused docs.
- Added adapter contribution guidance and a backend adapter issue template.
- Added a reusable FHIR REST transport, adapter starter, and layered contract
  harnesses; HAPI now proves the real-server contract in CI.
- Pinned React and React DOM to the 19.2.6 security baseline.
- Added Docker packaging notes for repeatable local evaluation.
- Added an explicit support matrix and a CI smoke test for the local HAPI
  onboarding path.
- Added an explicit zero-key scripted local HAPI walkthrough: no external model
  request, one synthetic record, and one approval-gated fixed observation.
- Added `npm run demo:local` for the repeatable zero-key path, plus a live
  HAPI CI smoke test that verifies the approval-gated scripted write.
- Clarified the local HAPI boundary: synthetic, single-tenant evaluation—not an
  offline general agent or authenticated deployment path.
- Removed chart-adjacent upstream error text from browser responses and
  analytics events.
- Added HAPI FHIR support for local synthetic evaluation.
- Added a Docker Compose HAPI FHIR + Postgres stack.
- Added the `FhirBackend` interface as the adapter seam.
- Added model provider policy: BAA-capable providers only.
- Added Amazon Bedrock support for BAA-capable multi-model deployments.
- Added optional demo model picker with server-side allowlist.

## 0.1 line

- Initial Next.js chat app over Medplum.
- Added four FHIR tools: search patients, show chart, add note, record
  observation.
- Added approval-gated writes in the web UI.
- Added synthetic seed patients.
- Added read-only-by-default MCP server.
