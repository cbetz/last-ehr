# FHIR Coverage

What Last EHR's agent can and cannot reach in FHIR, counted honestly. This
page exists because "how comprehensive is it?" deserves a number rather than
an adjective, and because the ceiling matters as much as the current mark.

**There is no percentage of R4 on this page, on purpose.** See
[Why not a percentage](#why-not-a-percentage).

## Axis A — chart sections the agent can read

Denominator: **US Core 9.0.0** (56 profiles over **27 distinct resource
types**, counted from the published
[profile list](https://hl7.org/fhir/us/core/profiles-and-extensions.html),
generated 2026-05-31), unmodified. US Core is the denominator because it is
the floor US implementers are actually asked about.

**25 of 27 US Core resource types**, plus 3 types US Core does not profile.

| Readable today | In US Core 9.0.0 |
| --- | --- |
| Patient | ✅ |
| Observation | ✅ |
| Condition | ✅ |
| AllergyIntolerance | ✅ |
| MedicationRequest | ✅ |
| Immunization | ✅ |
| DocumentReference | ✅ |
| Goal | ✅ |
| CarePlan | ✅ |
| Encounter | ✅ |
| DiagnosticReport | ✅ |
| Procedure | ✅ |
| ServiceRequest | ✅ |
| CareTeam | ✅ |
| Coverage | ✅ |
| Device | ✅ |
| FamilyMemberHistory | ✅ |
| MedicationDispense | ✅ |
| QuestionnaireResponse | ✅ |
| RelatedPerson | ✅ |
| Specimen | ✅ |
| Communication | ❌ — not a US Core profile |
| Task | ❌ — not a US Core profile |
| AuditEvent | ❌ — not a US Core profile |

Communication, Task, and AuditEvent are workflow and audit types, not US
Core clinical profiles. Worth stating plainly because **two of the three
types the agent can write are outside this denominator** — the write surface
and the read denominator are not the same set.

Four of those — Practitioner, Organization, Location, and Provenance — are
now reachable by **following a reference** rather than as sections, because
none of them can be scoped to a patient. `read_chart_section` takes an
`include` option (`authors`, `encounter`, `facility`, `location`,
`provenance`) and returns the referenced resources alongside the matches.

The 2 US Core types still unreachable: **Medication** and
**PractitionerRole**. Both are reachable by the same mechanism the moment a
backend models them as references (`MedicationRequest.medicationReference`,
a `PractitionerRole` performer) rather than inline codeable concepts, which
the synthetic data here does not. No new mechanism is needed — only data
that uses one.

**The AI-transparency read works now.** `include: "provenance"` on any
section uses `_revinclude=Provenance:target`, which is the only query that
finds provenance for a patient's *resources* — so the agent can finally
answer "which entries here were AI-written, and who approved them":

```
Observation/2209 — author: Last EHR agent (model-proposed);
                   verifier: Human reviewer (approval gate) (recorded 2026-02-10)
```

Three of those absences are deliberate rather than pending, and the reasons
are worth stating:

- **Practitioner, Organization, Location** have no `patient` search
  parameter, so they cannot be a patient-scoped chart section without
  breaking the rule that every read is scoped to one patient. They are
  reachable only by following a reference from a resource that names them —
  see the `_include` row under [resolution mechanisms](#axis-c--resolution-mechanisms).
- **Provenance** is the interesting one. R4 defines its `patient` parameter as
  `target.where(resolve() is Patient)`, so `Provenance?patient=X` returns
  only provenance whose *target is the Patient resource itself* — not
  provenance for that patient's observations and notes, which is exactly
  what the write path emits. Probed on HAPI: a Provenance targeting an
  Observation is invisible to `?patient=`. A patient-scoped Provenance
  section would therefore look like a working transparency read and return
  nothing for our own writes, so there isn't one. The mechanism that does
  work is `_revinclude=Provenance:target` on the resource search — a US Core
  SHALL, confirmed working on HAPI — which needs the bundle-shaped read path
  described under Axis C.

Until then, the closest available answer to *"what did the agent do to this
chart?"* is the **AuditEvent** section, which does work: the
rejected-proposal writer puts the Patient in `entity.what`, and
AuditEvent's `patient` parameter covers `entity.what`.

## Axis B — write types behind a rendered human approval

**3 types across 4 tools**: Communication (`add_note`), Observation
(`record_observation` and `record_superseding_observation`), Task
(`create_task`).

This is the axis that is the product. Every one of these is a *create* whose
exact fields are rendered to a human who must approve before anything
persists, per [Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md).
No update, no patch, no delete is reachable by any agent tool — deliberately;
the protocol's v0.1 draft holds updates and deletes out of scope until it has
field experience with creates.

**Correcting a wrong value without an update.** `record_superseding_observation`
files the corrected value as a *new* observation carrying the standard R4
[`observation-replaces`](https://hl7.org/fhir/R4/extension-observation-replaces.html)
extension, whose own HL7 comment names it "an alternative to updating the
Observation with a new version with status = 'amended' or 'corrected'." One
create, one approval, one machine-readable link — the supersession claim
rides the resource rather than a separate Provenance, so there is no second
write that could fail and leave an unlinked duplicate.

The limit is real and stated on the approval card, in the tool result, and
in the system prompt: **the earlier entry stays on the chart as a final
result.** It is not deleted and not marked `entered-in-error`, because both
require an update. The superseding entry copies the original's
`effective[x]` (so the chart shows one measurement event restated, not a
physiologically impossible jump) and carries `issued` = the moment the
correction was filed. Two entries then share an effective time, so
`_sort=-date` ordering between them is undefined — readers should follow the
extension, not the clock. This is the same limit Epic's public FHIR API has
for vitals; it is parity, not an unusual deficit.

There is no equivalent for notes or tasks: R4 gives Communication only
`inResponseTo` (threading, not supersession) and Task nothing at all, so
those tools deliberately have no superseding variant rather than a
homegrown link.

`record_observation` codes its writes from a pinned local table
([`lib/fhir/vitals.ts`](https://github.com/cbetz/last-ehr/blob/main/lib/fhir/vitals.ts)):
a recognized vital gains a LOINC `coding` and the `vital-signs` category —
both required by US Core Vital Signs — and `valueQuantity.system`/`code` are
set only when the unit resolves to a real UCUM code. An unrecognized label
stays plain `code.text` with **no** category, and an unrecognized unit gets
no UCUM code, because a guessed classification is worse than an honestly
uncoded row. The table is local by choice rather than a terminology server:
the mapping is visible in the approval card, so the reviewer sees the codes
that will save, and the write path gains no network dependency.

Not yet coded: laboratory results (no `laboratory` category is ever
asserted, since the agent cannot tell a lab from a vital by label alone) and
medications/conditions/allergies, which still write `code.text` only.

## Axis C — resolution mechanisms

**1 of 4.** Each remaining one is a thing a clinician expects an agent to be
able to do and it cannot.

| Mechanism | Status | What it would unlock |
| --- | --- | --- |
| Follow a reference (`_include` / `_revinclude`) | ✅ | "who ordered this", "who wrote that note", and the AI-transparency read — via an allowlisted `include` option per section, never a raw parameter |
| Page a result set | ❌ **decided against** — see below | would brute-force what a filter answers exactly |
| Resolve a code (`$expand` / `$validate-code`) | ❌ | LOINC/SNOMED/RxNorm coding rather than free-text `code.text` |
| Read a document body | ❌ | "what does the discharge summary actually say" — the agent can report only that a document exists |

### Why result paging is not implemented

Paging was investigated as the answer to "has he *ever* had a flu shot" and
rejected. The reasons are recorded here so it is not re-proposed as an
oversight.

- **It would dereference a server-authored URL — the transport's first.** Every
  URL fetched today is built from the configured base plus a path derived from a
  `ResourceType` union. `Bundle.link[next]` is not that, and it cannot be
  reconstructed: HAPI's next link is a **root-path** absolute URL carrying an
  opaque `_getpages` cursor, so `GET /fhir/Patient?_getpages=…` answers 400
  where `GET /fhir?_getpages=…` answers 200. A raw-absolute-URL primitive would
  need an origin validator duplicated across three publish boundaries. See the
  [threat model](./threat-model.md).
- **Page 2's query would be authored by the server**, which is free to drop
  `patient=` or the session `_tag`. The post-fetch visibility filter would stop
  being a fallback and become the only thing enforcing patient scope.
- **`Bundle.total` does not rescue it either.** Measured on the seeded HAPI
  stack: `_count=2` returns a `next` link and **no `total` at all**, while
  `_count=200` returns `total: 14`. HAPI reports the total only when the result
  set already fits — it is absent in exactly the truncated case that would need
  it. (`_summary=count` does return it, at the cost of a second request per
  section.) Any use of `total` must fail closed when absent, which lands back on
  the window signal already in place.
- **A filter answers the question exactly; paging answers it by brute force.**
  A coded or dated read collapses the result set below the window, so one
  request settles it — and paging hundreds of rows into model context is worse
  for the model than a narrow read.

The exhaustiveness question paging was meant to settle is instead answered by
reporting truncation honestly (below), and narrowing is the job of the
filters. **The higher-value rung is code resolution**, not paging: a coded
filter is what makes a narrow read possible, and today an uncoded record
cannot be found by one at all.

## RESTful interactions

**3 implemented, 2 reachable by an agent**, of the 11 in the R4 REST API.

| Interaction | Status |
| --- | --- |
| `search-type` | ✅ agent-reachable |
| `create` | ✅ agent-reachable (approval-gated) |
| `delete` | ⚠️ implemented, contractually **not** wired to any agent tool — seeding, eval cleanup, and conformance cleanup only |
| `read`, `vread` | ❌ — see below |
| `update`, `patch` | ❌ out of scope in protocol v0.1 |
| `history` (instance/type/system) | ❌ |
| `capabilities` | ❌ |
| `batch`, `transaction` | ❌ |
| conditional create/update/delete | ❌ |

**Extended operations: 0.** No `$everything`, `$lastn`, `$expand`,
`$validate`, `$docref`, or `$match`.

### Why there is no read-by-id

Every single-resource fetch is a type search with `_id`, not a
`GET /{type}/{id}`. This is a deliberate constraint, not an omission: a
compartment-scoped SMART or Medplum session enforces its `AccessPolicy` on
the search path, so a direct instance read can return 403 where the
equivalent search succeeds. The adapter contract requires the search form for
exactly this reason. Adding "real" read-by-id would narrow which sessions
work — a safety regression wearing a coverage win.

## Search feature coverage

The tool builds every query. The model chooses a section and filters and
never supplies raw search parameters, so the model's entire search vocabulary
is: a patient name, a section from a 23-value allowlist, a
code token, a status, a category, `dateFrom`, `dateTo`, and a count of 1-100.

| Feature | Status |
| --- | --- |
| Patient-scoped search on every section | ✅ enforced, not optional — a type without a `patient` parameter cannot become a section |
| Newest-first server-side `_sort` on every section | ✅ each value probed for real ordering |
| Single date bound | ✅ |
| Date range | ⚠️ one bound is applied server-side and the other filtered from the returned rows; correct results, but a range wider than the window reports `truncated` |
| `code` token filter | ✅ on 9 sections (Observation, Condition, AllergyIntolerance, MedicationRequest, Immunization, Encounter, DiagnosticReport, Procedure, ServiceRequest) — coded records only |
| `status` filter | ✅ every section, mapped to that type's own parameter (`clinical-status`, `lifecycle-status`, `status`) and validated against its R4 value set |
| `category` filter | ✅ Observation — separates `vital-signs` from `laboratory` |
| Paging (`Bundle.link[next]`) | ❌ **decided against**, not merely absent — `_count` is a cap, not a page; see [why](#why-result-paging-is-not-implemented) |
| Repeated parameters | ❌ — the structured-params contract carries one value per key |
| `_include` / `_revinclude` | ✅ allowlisted options per section; chained and `_has` still ❌ |

The model gets one filter vocabulary; the tool maps it to each section's own
search parameter and validates the value against that section's R4 value set.
An illegal value is refused **with the legal list**, so the model corrects
itself rather than reading an unfiltered section — asking for `status:
"active"` on Task, which has no such status, names
requested/received/accepted/in-progress/ready instead.

**A read that cannot apply a filter refuses it.** A section with no date
parameter rejects `dateFrom`/`dateTo` rather than returning unfiltered rows
that the model would report as filtered. AllergyIntolerance and Goal are in
that position deliberately: R4 offers `date` and `start-date`, but both index
a recorded/start date that is frequently absent in real data, so a dated
query would answer "nothing in that window" for a patient who *does* have the
allergy. A refused filter is recoverable; a confident false negative on a
chart is not.

**Every read reports truncation, measured at the server window.** When a
query's server-side window comes back full, the reply carries
`truncated: true` and the system prompt forbids the agent from stating an
absence from a truncated read. Fullness is deliberately *not* the count of
rows the reply contains: session isolation drops other sessions' rows after
the fetch, so a full window can leave few or zero visible rows, and a
row-count signal would have called that an exhaustive search. It is measured
per query arm against what that arm asked the server for.

**An empty coded read is reported as an unmatched code, never as an
absence.** A coded search parameter can only match a record that carries a
coding, and text-only `CodeableConcept`s are ordinary FHIR — this
repository's own synthetic immunizations and medications are text-only on
purpose, because asserting CVX/RxNorm codes nobody verified would be worse.
Measured on the seeded stack: `Immunization?vaccine-code=88` answers
`total: 0` while 14 immunizations exist. `truncated` cannot cover that case,
because the server genuinely matched nothing and the window was never full.
So when a coded read returns nothing, the tool asks once whether the section
holds rows that differ *only* by the code, and reports
`codeFilterUnmatched: true` if it does. The system prompt then requires a
re-read without the code before answering, and the chart card tells the human
reader the same thing. This is the false negative the "resolve a code" rung
above exists to close properly.

## Why not a percentage

Three reasons, and they are the same reasons "100% coverage" is not a goal
this project will adopt.

**A percentage of R4 is not a project-level number.** R4 is explicit that
servers need not implement *any* standard search parameter except `_id`. The
five backends here already disagree in practice — the session-visibility read
carries a fallback because one server rejects a token that another silently
ignores and a third honors. A portable layer cannot claim coverage its
backends do not have, and the [adapter guide](./adapters.md) already declines
to trust a server's own `CapabilityStatement`.

**Total coverage is available, cheap, and forbidden here.** One tool —
`fhir_request(method, path, body)` — reaches every interaction, every type,
and every operation in an afternoon. Last EHR will not ship it, because with
no bounded field set there is nothing to render to a reviewer, which makes
the protocol's "human-readable rendering of the exact proposed fields"
unimplementable and two conformance checks unenforceable. Breadth and the
approval gate are one decision, not two.

**The measured result is worse, too.** Published 2026 evaluation work on
generic FHIR agent tooling — create/search/read/update/delete handed to the
model directly — reports roughly 60% task success on held-out write-bearing
tasks. The design that maximizes coverage measurably fails a large share of
write tasks.

## What will never be added

- **A generic `fhir_request` or `create_resource(type, body)` tool.** See
  above.
- **Model-authored search parameters.** No raw query strings, no `params`
  passthrough. The tool builds every query so that patient scoping, caps, and
  session isolation are structural rather than instructed.

Coverage grows by adding *named, rendered, bounded* capabilities. The counts
on this page are meant to go up; the two lines above are meant not to move.
