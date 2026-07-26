# Changelog

This project is alpha. The changelog records adoption-relevant changes so
self-hosters can tell what moved between pulls.

## Unreleased

## 0.2.9 — 2026-07-25

**Security.** `@lastehr/mcp` 0.2.0 and `@lastehr/agent-write-conformance`
0.1.0 follow HTTP redirects and read response bodies without a size or time
bound. Upgrade if you point either at a server you do not fully control.

- **No FHIR fetch follows a redirect or reads an unbounded body.** The
  transport builds every URL it fetches from the configured base plus a path
  derived from a `ResourceType` union, which makes it easy to assume a
  configured server cannot steer it. Node's `fetch` defaults granted it three
  powers anyway, none of which needed paging or any new feature to reach:

  - **The destination.** With no `redirect` option, Node's default is
    `"follow"`. Verified by probe: a cross-origin `302` answering an ordinary
    `/Patient?_count=25` was followed silently, and the redirect target's
    Bundle came back as the FHIR server's answer — attacker-chosen content
    entering the chart, and the model's context, as if the store had returned
    it. Node does strip `authorization` on a cross-origin hop (so Aidbox's
    Basic credential and the Firely/Oystehr bearer tokens are not exposed)
    but does not strip custom headers.
  - **The memory.** An unbounded `res.text()` buffered 40 MiB in 60 ms from a
    hostile server. A `content-length` precheck does not help; a chunked
    response carries no such header.
  - **The duration.** With no `signal`, a trickling body holds a request open
    indefinitely.

  All three FHIR fetch sites now refuse redirects (a 3xx becomes a failure
  that names no host, because a redirect target *is* a host and errors reach
  logs and the dev panel), bound the request with `AbortSignal.timeout`, and
  read bodies under a 16 MiB ceiling. On the MCP write path the refusal lands
  before the `Location`-header id fallback, so a 3xx cannot redirect an
  approved write off-host. The two packages publish standalone and import
  nothing from `lib/`, so the control is necessarily duplicated; a
  source-level guard fails if any copy stops applying it.

- **Truncation is measured at the server window, not the surviving rows.**
  `read_chart_section` derived `truncated` from the row count that survived
  session-isolation filtering — rows dropped *after* the fetch. So a full
  server window spent on other sessions' rows left zero visible rows and
  reported `truncated: false`, and because the system prompt only forbids
  asserting an absence from a *truncated* read, `false` actively licensed
  "she has never had a flu shot" from a window that never showed one.
  Reachable on Aidbox with a single full window (it ignores the bare-system
  `_tag:not` token, so the query succeeds and the over-fetch fallback never
  fires) and on HAPI with a full over-fetched window. Fullness is now
  measured per query arm against what that arm asked the server for, and on
  match rows only for the include path so `_include` entries cannot fake
  truncation.

- **An empty coded read reports an unmatched code, not an absence.** A coded
  search parameter can only match a record that carries a coding, and
  text-only `CodeableConcept`s are ordinary FHIR — this repository's own
  synthetic immunizations and medications are text-only on purpose, because
  asserting CVX/RxNorm codes nobody verified would be worse. Measured on the
  seeded stack, `Immunization?vaccine-code=88` answers `total: 0` while 14
  immunizations exist. `truncated` cannot cover that case and correctly does
  not: the server genuinely matched nothing, so the window was never full. An
  empty coded read now asks once whether the section holds rows differing
  *only* by the code and reports `codeFilterUnmatched`, the prompt requires a
  re-read without the code before answering, and the chart card tells the
  human reader the same thing.

- **Ask for a vital by name instead of a remembered LOINC code.**
  `read_chart_section` takes a `measurement` name on Observation and resolves
  it through the same pinned table `record_observation` codes writes with, so
  a read and a write mean the same thing by one label. `"blood pressure"`
  resolves to *both* systolic and diastolic, comma-ORed into one parameter
  value, because searching one alone answers half the question and reports
  the result as complete. An unrecognized name is refused with the list of
  accepted names rather than searched for. **Axis C goes from 1 of 4
  mechanisms to 1 fully plus 1 partly** — deliberately not counted as a full
  rung, because this covers vital signs and nothing else.

- **Result paging is now a recorded decision, not a gap.** It was
  investigated as the answer to "has he ever had X" and rejected:
  `Bundle.link[next]` is a server-authored absolute URL (HAPI's carries an
  opaque `_getpages` cursor on the *root* path, so it cannot be reconstructed
  on a type path), page 2's query would be authored by the server and free to
  drop `patient=` or the session tag, and a filter answers the question
  exactly where paging brute-forces it. `Bundle.total` does not rescue it
  either — probed on HAPI, `_count=2` returns a `next` link and **no
  `total`**, while `_count=200` returns `total: 14`; the total is reported
  only when the result set already fits.

- **Code resolution uses a local table rather than `$expand`, on evidence.**
  Probed against HAPI: no terminology operation is advertised in the
  `CapabilityStatement`, `$expand` on the CVX vaccine-code value set answers
  412 (`CodeSystem could not be found`), `$lookup` for LOINC `8480-6` answers
  404, and `$validate-code` answered HTTP 200 for a CVX code against a server
  with no CVX loaded. A terminology check that reports "not a valid code"
  when it means "I do not have that code system" manufactures the exact false
  negative it would be added to prevent.

- The chart card no longer prints "No matching records in this section" when
  the read was capped, a reference lookup was refused, or a code filter
  matched nothing — the human reader is the safety boundary and now gets at
  least as much honesty as the model does.

- `read_chart_section` can follow references. A new `include` option
  (`authors`, `encounter`, `facility`, `location`, `provenance`) returns the
  resources a section points at, so author and performer references stop
  being dead pointers. **Axis A goes 21 → 25 of US Core 9.0.0's 27 types**
  and the first of four resolution mechanisms closes, because Practitioner,
  Organization, Location, and Provenance cannot be scoped to a patient and
  are reachable no other way.

  This makes the AI-transparency read work for the first time:
  `include: "provenance"` uses `_revinclude=Provenance:target`, the only
  query that finds provenance for a patient's *resources* rather than for
  the Patient resource itself, so the agent can answer "which entries here
  were AI-written, and who approved them".

  The model still authors no search parameter — it picks from an
  allowlisted vocabulary and the tool supplies the token, refusing an
  option a section cannot honor with the ones it can.

  Two isolation hazards handled, both verified live against HAPI with two
  concurrent demo sessions: the server returns includes for **every** match
  it found, including rows belonging to other sessions that the visibility
  filter is about to drop, so matches are filtered first and an included
  resource survives only if it is still connected to a surviving match.
  A foreign session's Provenance — and every trace of it — is absent from
  the reply, while the owning session still sees its own.

  A backend that rejects the parameter degrades to a plain read and says
  `includeUnsupported`, never letting an unsupported lookup read as "no
  related records exist".

- Six more chart sections — Device, FamilyMemberHistory, MedicationDispense,
  QuestionnaireResponse, RelatedPerson, Specimen — taking readable US Core
  9.0.0 resource types from 15 of 27 to **21 of 27**. Every patient
  parameter, date parameter, sort, and status filter probed against HAPI
  before exposure, then read end-to-end through the tool.

  That completes the patient-scopeable set: the six US Core types still
  unreachable (Location, Medication, Organization, Practitioner,
  PractitionerRole, Provenance) are all unreachable for the *same* reason —
  none can be scoped to a patient, so none can be a chart section. One
  mechanism, `_include`/`_revinclude`, takes this axis from 21 to 27.

- docs/fhir-coverage.md is now guarded by a test. Twice a rung updated its
  tables and left the surrounding prose stale (it claimed a "10-value"
  section allowlist when there were 17, and listed the code filter on 5
  sections when it was on 9). The counts are now derived from the tool
  schema and asserted, along with every section appearing in the Axis A
  table and every write tool being named. The page whose entire value is
  that its numbers are right can no longer quietly stop being right.

- `record_superseding_observation` is now in `@lastehr/mcp` too, so both
  bindings offer the same write surface. The MCP form fetches the original
  before asking, so the elicitation names the row being superseded and a
  bogus or cross-patient id is refused **without bothering a reviewer with
  a proposal that cannot commit** — the same pre-elicitation policy
  ordering the write profile already uses.

- New gated write `record_superseding_observation`: when a value already on
  the chart is wrong, the agent can propose a corrected one. Today's answer
  to "that weight was wrong" is "I can't."

  It uses the standard R4 `observation-replaces` extension — whose own HL7
  comment names it "an alternative to updating the Observation with a new
  version with status = 'amended' or 'corrected'" — so the whole capability
  is ONE approved create and needs no change to the write protocol, which
  holds updates out of scope in v0.1. Putting the link on the resource
  rather than in a separate Provenance matters: the supersession claim is
  what distinguishes a correction from a duplicate, so it must be part of
  the create that the human approved, not a second write that could fail
  and leave two contradictory values with nothing joining them.

  The limit is stated on the approval card, in the tool result the model
  paraphrases, and in the system prompt: the earlier entry stays on the
  chart as a final result. It is not deleted and not marked
  `entered-in-error` — both require an update. The new entry copies the
  original's `effective[x]` so the trend shows one measurement restated
  rather than an impossible jump, with `issued` recording when the
  correction was filed. The tool refuses a bogus id rather than minting a
  dangling reference, and refuses an observation belonging to another
  patient. `status` stays `final`: "corrected" and "amended" describe a
  resource's own prior lifecycle, and this one was never final before.


- Agent-written observations are now coded, in both bindings. A recognized
  vital gains a LOINC `coding` and the `vital-signs` category — both
  required by US Core Vital Signs — from a pinned local table
  (`lib/fhir/vitals.ts`), and the approval card renders the derived codes
  from that same function, so the reviewer sees the LOINC and UCUM codes
  that will save rather than discovering them on the chart.

  This also retires a live untruth: `valueQuantity.code` used to receive
  the unit string a human typed, asserting that "bpm" was a UCUM code when
  the UCUM code is `/min`. The system and code are now set only when the
  unit actually resolves, and the typed unit is kept as the display value.
  An unrecognized label stays plain text with NO category rather than a
  guessed classification.

  Verified end-to-end on HAPI: an agent-written heart rate now carries
  LOINC 8867-4, `category=vital-signs`, and `valueQuantity.code=/min`, and
  is findable by the `category: vital-signs` read filter — which could not
  have found it before, since agent writes carried no category at all.
  The `@lastehr/mcp` copy of the table is guarded by a test that runs both
  modules over a matrix of labels and units and asserts identical output,
  so the two bindings cannot drift into coding the same write differently.

- `read_chart_section` grew from 10 sections to 17, taking readable US Core
  9.0.0 resource types from 9 of 27 to 15 of 27: Encounter ("what happened
  at her last visit" — nothing could answer this), DiagnosticReport (which
  carries the `conclusion` a loose Observation list loses), Procedure,
  ServiceRequest, CareTeam, Coverage, and AuditEvent (which proposed writes
  a reviewer rejected). Every patient parameter, date parameter, sort, and
  status filter was probed against HAPI before exposure, then verified
  end-to-end through the tool itself.

  Two absences are deliberate and documented rather than pending.
  Practitioner, Organization, and Location have no `patient` search
  parameter, so they cannot be patient-scoped sections without breaking the
  one-patient rule. And there is no Provenance section: R4 defines its
  `patient` parameter as `target.where(resolve() is Patient)`, so
  `Provenance?patient=X` cannot see provenance targeting that patient's
  observations — which is exactly what the write path emits. A section
  would have looked like a working AI-transparency read and returned
  nothing for our own writes; `_revinclude=Provenance:target` is the
  mechanism that works, and it needs a bundle-shaped read path.

- `read_chart_section` gained status, category, and per-section code
  filters, so the agent can ask for *current* records instead of fetching
  everything and sorting it out: "her active problems", "what's still open
  on his task list", "her labs, not her vitals", "has she had this
  vaccine (by CVX code)". The model uses one vocabulary (`status`,
  `category`, `code`) and the tool maps it to each section's own search
  parameter — `clinical-status` for Condition and AllergyIntolerance,
  `lifecycle-status` for Goal, `status` elsewhere, `vaccine-code` for
  Immunization — validating the value against that section's R4 value set
  and refusing an illegal one WITH the legal list, so the model corrects
  itself rather than silently reading an unfiltered section. Every
  parameter name was probed against HAPI with two rows differing only in
  the filtered field, then verified end-to-end through the tool itself.

- Chart reads now report their own limits instead of overstating them.
  `read_chart_section` returns a `truncated` flag whenever a result fills
  the window, and the system prompt forbids the agent from stating an
  absence ("no record of X") from a truncated read. A filter a section
  cannot apply is now REFUSED rather than silently dropped, so unfiltered
  rows can never be reported as filtered. Every section gained a
  server-side newest-first `_sort` (five had none, so their window was
  whatever order the server chose) — each value probed against HAPI for
  real ordering, not just acceptance.

- Fixed a date-range read that could report an empty chart section while
  the rows existed: a full range now sends the UPPER bound to the server
  and filters the lower bound from the returned rows. With the previous
  lower-bound-first form, a patient with recent data filled the
  newest-first window with rows above the range, and the client-side
  filter dropped every one — verified live on HAPI, where a query for a
  three-row range returned nothing before the fix and all three after.

- New [FHIR coverage page](docs/fhir-coverage.md): what the agent can and
  cannot reach, counted against US Core 9.0.0 (9 of its 27 resource
  types), plus the write and resolution axes, why there is no read-by-id,
  why the project publishes no "percentage of R4", and the two
  capabilities that will never be added (a generic `fhir_request` tool and
  model-authored search parameters).

- Oystehr is demo-eligible (`DEMO_ELIGIBLE_BACKENDS`) for operator-owned,
  seeded projects: eligibility evidence in docs/support.md (contract 5/5
  with server-side `_tag:not` honored per direct probe, safety eval 7/7,
  audit metadata persistence). Self-hosted pickers can now offer
  `oystehr|<label>` in `NEXT_PUBLIC_DEMO_BACKENDS`.

- New verified backend adapter: Oystehr (`FHIR_BACKEND=oystehr`) —
  OAuth2 M2M client credentials against Oystehr's hosted FHIR R4 API,
  with lazy token minting, exp-based caching, and single-flighted
  refresh. Verified 2026-07-21 against a developer-tier sandbox:
  real-server contract 5/5 (a direct probe confirmed Oystehr honors
  bare-system `_tag:not` server-side, so session isolation needs no
  client-side filter arm), FHIR Agent
  Safety Eval 7/7, and `meta.security`/`meta.tag` persist on create.
  Synthetic-evaluation tier: the developer tier is non-production/no-PHI
  by contract.

## 0.2.8 — 2026-07-20

- The site and README now lead with the protocol: "Make every AI chart
  write a reviewable proposal," the Proposal → Decision → Commit → Audit
  framing, a homepage section presenting both running implementations and
  the conformance command, and Start-here placement for the protocol and
  conformance docs. Every remaining stale public claim about the write
  surface (read-only MCP, four tools, hypothetical writes) was corrected,
  and copy that overstated what ships was tightened to exactly what the
  code proves.

- New package `@lastehr/agent-write-conformance` (0.1.0): the standalone
  conformance suite for the Approval-Gated Agent Writes on FHIR protocol
  (v0.1 draft). An MCP stdio client with a scripted reviewer spawns any
  implementing server fresh per scenario, answers each elicitation every
  possible way, and verifies every outcome against the FHIR store with
  its own reads — capability gate, proposal-before-persistence (probed
  during reviewer deliberation), boolean-only decision shape, approved/
  denied/unavailable outcomes, commit fidelity, and cleanup. Reports are
  scrub-clean (static details only) and stamp the suite and spec
  versions; requirements a mechanical suite cannot observe ship as an
  explicit attestations block. The repository's own `@lastehr/mcp` write
  profile is conformance run #1 (see the worked example manifest in
  packages/conformance/examples). `--strict` additionally counts the
  SHOULD-level audit checks — the AIAST security label on every approved
  write, and author/verifier Provenance — and CI now runs the suite in
  strict mode against the repository's own stdio server and live HAPI on
  every commit, uploading the report as a build artifact. New
  docs/conformance.md page documents running it against your own
  implementation.

## 0.2.7 — 2026-07-19

- New gated write `create_task` in both bindings: propose a follow-up
  task (description, optional due date) that a human approves before a
  FHIR `Task` is created — the same proposal/decision/commit pipeline as
  the existing writes, with the AIAST label, optional Provenance, session
  tagging, policy hooks, and SMART scope (`patient/Task.crs`) wired
  through. `read_chart_section` gains a `Task` section (a tenth allowlisted
  type) so created tasks are answerable, and the seed wipe now clears
  `Task` rows.

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
