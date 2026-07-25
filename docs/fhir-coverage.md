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

**9 of 27 US Core resource types**, plus 2 types US Core does not profile.

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
| Communication | ❌ — not a US Core profile |
| Task | ❌ — not a US Core profile |

Communication and Task are agent-workflow types, not US Core clinical
profiles. Worth stating plainly because **two of the three types the agent
can write are outside this denominator** — the write surface and the read
denominator are not the same set.

The 18 US Core types with no read path today: CareTeam, Coverage, Device,
DiagnosticReport, Encounter, FamilyMemberHistory, Location, Medication,
MedicationDispense, Organization, Practitioner, PractitionerRole, Procedure,
Provenance, QuestionnaireResponse, RelatedPerson, ServiceRequest, Specimen.

Two consequences of that list are worth naming rather than leaving for a
reader to discover:

- **No Encounter read** means the agent cannot answer "what happened at her
  last visit."
- **No Provenance read** means the agent writes `Provenance` (opt-in, see
  [approval gates](./approval-gates.md)) and cannot read it back. It cannot
  answer *"which entries on this chart were AI-written?"* — a question this
  project's own transparency posture exists to make answerable.

## Axis B — write types behind a rendered human approval

**3**: Communication (`add_note`), Observation (`record_observation`), Task
(`create_task`).

This is the axis that is the product. Every one of these is a *create* whose
exact fields are rendered to a human who must approve before anything
persists, per [Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md).
No update, no patch, no delete is reachable by any agent tool — deliberately;
the protocol's v0.1 draft holds updates and deletes out of scope until it has
field experience with creates.

`record_observation` does not yet satisfy the US Core Vital Signs or
Laboratory Result profiles: it writes `code.text` with no `coding` and no
`category`, and it copies the human-supplied unit string into
`valueQuantity.code`, which is a valid UCUM code for some units and not for
others. Tracked in the [roadmap](../ROADMAP.md).

## Axis C — resolution mechanisms

**0 of 4.** Each one is a thing a clinician expects an agent to be able to do
and it cannot.

| Mechanism | Status | What it would unlock |
| --- | --- | --- |
| Follow a reference (`_include`) | ❌ | "who ordered this", "who wrote that note" — every author/performer reference is a dead pointer today |
| Page a result set | ❌ | "has he *ever* had a flu shot", answered from the record instead of one window |
| Resolve a code (`$expand` / `$validate-code`) | ❌ | LOINC/SNOMED/RxNorm coding rather than free-text `code.text` |
| Read a document body | ❌ | "what does the discharge summary actually say" — the agent can report only that a document exists |

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
is: a patient name, a section from a 10-value allowlist, an Observation-only
code token, `dateFrom`, `dateTo`, and a count of 1-100.

| Feature | Status |
| --- | --- |
| Patient-scoped search on every section | ✅ enforced, not optional |
| Newest-first server-side `_sort` on every section | ✅ each value probed for real ordering |
| Single date bound | ✅ |
| Date range | ⚠️ one bound is applied server-side and the other filtered from the returned rows; correct results, but a range wider than the window reports `truncated` |
| `code` token filter | ✅ Observation, Condition, AllergyIntolerance, MedicationRequest, Immunization (`vaccine-code`) — coded records only |
| `status` filter | ✅ every section, mapped to that type's own parameter (`clinical-status`, `lifecycle-status`, `status`) and validated against its R4 value set |
| `category` filter | ✅ Observation — separates `vital-signs` from `laboratory` |
| Paging (`Bundle.link[next]`) | ❌ — `_count` is a cap, not a page |
| Repeated parameters | ❌ — the structured-params contract carries one value per key |
| `_include` / `_revinclude` / chained / `_has` | ❌ |

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

**Every read reports truncation.** When a result fills the window, the reply
carries `truncated: true` and the system prompt forbids the agent from
stating an absence from a truncated read.

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
