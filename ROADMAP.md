# Last EHR Roadmap

Last EHR's north star is to be the open-source reference implementation for
approval-gated AI agent workflows over FHIR charts. The project should stay
small enough to inspect, but useful enough that teams can clone it, run it on
synthetic data, and adapt it to their own FHIR backend.

This roadmap is intentionally public. It tells users what is safe to depend on,
and it gives contributors concrete places to help.

## Current focus

### 1. Demo-to-local adoption

- Keep the hosted demo no-signup and synthetic-data only.
- Make the first demo path reach the approval gate in one click.
- Keep the HAPI FHIR local path working end to end.
- Add Docker packaging so a full local stack is repeatable.
- Track where evaluators drop off: demo start, first tool call, first approval,
  local quickstart, and GitHub/docs handoff.

### 2. Backend portability

The `FhirBackend` interface is the main extension point. Medplum works today
for authenticated use; local HAPI, Firely Server (`FHIR_BACKEND=firely`), and
Aidbox (`FHIR_BACKEND=aidbox`) are verified synthetic-evaluation adapters,
each with contract tests, a setup note, and an honest auth/tenant caveat in
[docs/adapters.md](./docs/adapters.md).

Shipped: a demo **backend picker** (choose the EHR under the live agent, per
session) and an **under-the-hood panel** streaming the agent's FHIR
operations — both self-hosters-first and off by default; see the
[support matrix](./docs/support.md) for the eligibility rules. The hosted
demo stays Medplum-only until a second operator-owned, seeded backend
exists. The next useful adapters are:

- Oystehr
- OpenEMR FHIR API, if the API surface can satisfy the tool contract

### 2.1 Synthetic workflow evidence

The [FHIR Agent Safety Eval](./docs/evals.md) creates and deletes disposable
charts, verifies the web-agent proposal/approval and denial mechanics, and
emits a scrubbed report. It is not a clinical, authorization, or compliance
certification.

Adapter sandboxes now run the same evaluator directly
(`npm run eval -- --backend <name> --base-url <url> --confirm-synthetic`);
the Firely and Aidbox adapters were verified this way, and the
[support matrix](./docs/support.md) records each verified integration's auth
mode and boundary. Still ahead: pinning each entry to a backend version, Last
EHR revision, report/CI link, and retest date.

### 3. Safer approval workflows

Approval-gated writes are the wedge. Shipped so far: the approval card shows
the exact proposed fields with a FHIR-shaped preview, and deployments can opt
into a [rejected-proposal audit trail](./docs/approval-gates.md)
(`LASTEHR_AUDIT_REJECTED_PROPOSALS`) that records a FHIR AuditEvent per
denial. Near-term work:

- Support cancel/retry flows that are easy to understand.
- Explore editable proposals without weakening the "what you see is what saves"
  rule.
- Add policy hooks so operators can require approval by resource type,
  project, environment, or SMART scope.

### 4. More useful clinical tools

The default agent should remain narrow, but the tool catalog should grow in
well-reviewed steps:

- Task creation and assignment
- DocumentReference read support
- Encounter-scoped notes
- Goal and CarePlan read support
- Better Observation coding and unit normalization
- Condition/MedicationRequest write experiments behind stricter gates

High-risk writes should not be added as a casual demo feature.

### 5. MCP as a serious interface

`@lastehr/mcp` is permanently read-only in the initial `0.1.x` line because
there is no Last EHR approval card in an MCP host. Planned work:

- Better bounded read coverage for Medplum projects.
- Tool annotations that help clients distinguish chart reads from future,
  proposal-shaped operations.
- A reviewable confirmation protocol before any direct-write surface is
  considered.

## Stability

The repo is alpha. The current stable promises are:

- Apache-2.0 license.
- Synthetic-data-first development posture.
- No chart database inside Last EHR.
- Reads go to the configured model provider under the operator's key.
- Writes through the web app remain approval-gated.
- Backend access control belongs to the FHIR backend, not this UI layer.

Everything else, including file structure, tool schemas, and UI flows, can
change until the first 1.0 line is declared.

## Not planned

- Becoming a full EHR or source of truth.
- Bundling a forked FHIR backend.
- Shipping non-BAA-capable model aggregators as first-class providers.
- Claiming HIPAA compliance for the open-source repo.
- Silent autonomous writes to clinically meaningful chart resources.

## How to help

Start with `docs/adapters.md`, `docs/approval-gates.md`, or `docs/mcp.md`, or
pick something from the
[good first issue](https://github.com/cbetz/last-ehr/labels/good%20first%20issue)
label. Small PRs are preferred. If a change touches real clinical risk, open an
issue, start a thread in
[Discussions](https://github.com/cbetz/last-ehr/discussions), or draft a PR
before implementing the whole feature.
