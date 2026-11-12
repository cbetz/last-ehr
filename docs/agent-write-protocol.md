# Approval-Gated Agent Writes on FHIR

**Version 0.1 — draft.** This document specifies a small, framework-neutral
protocol for AI agents that write to FHIR charts: every write is a
**Proposal** a human explicitly **Decides** on before it **Commits**, with an
**Audit** trail binding the three together. It is extracted from two running
implementations in this repository — the web agent's approval card and the
`@lastehr/mcp` write profile — rather than designed on paper, and Last EHR is
its reference implementation. Feedback and independent implementations are
invited; the protocol is small on purpose.

The key words MUST, MUST NOT, SHOULD, and MAY are to be interpreted as in
RFC 2119.

## Why this layer is missing

Every neighboring layer already has an owner. [CDS Hooks](https://cds-hooks.hl7.org/)
standardizes *EHR-initiated* suggestion cards with accept/override feedback.
HL7's [AI Transparency on FHIR IG](https://build.fhir.org/ig/HL7/aitransparency-ig/)
standardizes *after-the-fact* provenance of AI-touched data and explicitly
declines to define approval workflows. [SMART App Launch](https://build.fhir.org/ig/HL7/smart-app-launch/)
and emerging IETF drafts own identity and delegation. MCP owns transport. The
unclaimed center — the semantics of an *agent-initiated* write that a human
must approve before it exists — is what this document specifies. Where an
existing vocabulary fits, this protocol reuses it and says so.

## Actors

- **Agent** — software (typically model-driven) that proposes chart writes.
- **Reviewer** — the human who sees each proposal and decides.
- **Host** — whatever renders proposals to the reviewer and returns
  decisions: a web app's approval card, an MCP client's elicitation prompt,
  a CDS Hooks card, an agent framework's approval pause.
- **FHIR server** — the system of record. Authorization, tenancy, and access
  policy remain its job; this protocol never substitutes for them.

## The protocol

### 1. Proposal

A write tool invoked by the agent MUST NOT execute. It MUST instead produce a
proposal consisting of:

- the **exact FHIR resource** it would create, built by tool code from
  validated, capped inputs — the agent supplies domain values (a note's
  text, an observation's value), never raw FHIR or raw search/write
  parameters; and
- a **human-readable rendering of the exact proposed fields** — what the
  reviewer sees is what will save.

Proposals MUST be scoped to a single patient, and free-text values that
originated outside the reviewer's own words SHOULD carry an explicit
untrusted-content boundary when they are echoed back through model context
(this repository wraps them in `<chart_text>` tags).

*Vocabulary note:* a Proposal is semantically a CDS Hooks **suggestion**
carrying a single `create` **action** — reused here for an agent-initiated
flow rather than a hook-triggered one.

### 2. Decision

The host presents the proposal's rendering to the reviewer and returns
exactly one decision per proposed action:

- **Approved** — an explicit, affirmative act by the reviewer.
- **Denied** — the reviewer saw the proposal and did not approve it.
- **Unavailable** — the proposal could not be presented at all.

Requirements:

- Only an explicit approval MAY commit. There is no default, no timeout that
  approves, and — in this version — no batch approval.
- Every other outcome, including transport failure, timeout, ambiguity, and
  the host lacking the capability to render proposals, MUST fail closed:
  nothing is written, and the agent-visible result says so.
- Hosts that cannot render proposals MUST NOT be offered write capability at
  all (capability gating), so a degraded host cannot even ask.
- Denied and unavailable SHOULD be distinguishable in the result: a denial
  attributes a decision to a human; unavailability must not.
- The decision exchange MUST request a *decision*, never data.

Implementations MAY apply automated **policy** that narrows what may
commit. Policy can only deny: a policy outcome is never an approval, MUST
NOT substitute for the reviewer's decision, and MUST NOT cause any write to
proceed without one. Policy SHOULD be evaluated before a proposal is
presented, so reviewers are never asked to decide writes that cannot
commit, and MAY be re-evaluated at any point up to commit; a proposal
denied by policy MUST NOT commit even if the reviewer approved it. A policy
denial fails closed — nothing is written and the agent-visible result says
so — and MUST be distinguishable from both a reviewer's denial and
unavailability: it attributes the outcome to configuration, never to a
human. Policy evaluation failure MUST deny. Statically disabled write
capability SHOULD be unregistered (per the capability-gating rule above)
rather than offered and always denied; reason text accompanying a policy
denial MUST be static configuration text, never interpolated with patient
or chart data.

*Vocabulary note:* approved/denied map to CDS Hooks feedback's
`accepted`/`overridden` outcomes.

### 3. Commit

On approval — and, where the implementation applies policy (section 2),
only when policy permits, and, where the proposal names chart resources it
relies on, only when the evidence check below permits — the implementation
MUST create **exactly the proposed resource** — every field the reviewer saw,
unaltered. Fields the reviewer did not see
MUST be limited to mechanical metadata (server-assigned id and version,
commit-time timestamps, and the audit markers below), and implementations
SHOULD stamp clinically meaningful timestamps at commit time so they reflect
the approved save, not the proposal's construction.

Where a proposal names chart resources it relies on — a citation list, or
the earlier resource a new record supersedes — the implementation MUST
record a version token for each of them while the proposal is prepared, and
MUST read each of them again after approval and before the create. The
token MUST be the resource's `meta.versionId` when the read carries one,
otherwise `meta.lastUpdated` when that is present, otherwise a content hash
of the resource as read. This repository uses SHA-256 over JSON with object
keys sorted and array order preserved. The hash exists because some stores
persist neither meta field; the in-process memory store is one. The token
recorded at proposal time MUST come from the read the agent already
performed in the session when that read is still available; otherwise the
resource is read while the proposal is prepared. If any named resource is
missing, deleted, or its token differs, or the re-read fails, the
implementation MUST NOT create the resource. The result MUST name which
reference could not be confirmed and MUST say that nothing was saved, so
the agent can read again and propose again. A read error fails closed,
because the implementation cannot show that the resource is still the one
the reviewer saw. A proposal that names no such resource is not subject to
this check.

The reviewer approves a proposal grounded in those rows. A row that changes
or disappears while they decide is no longer the evidence they were shown,
and saving would write against a chart the approval did not cover.

The result returned to the agent MUST state whether the write happened and,
when it did, the server-assigned id.

### 4. Audit

Approved writes SHOULD be discoverable and attributable:

- The created resource SHOULD carry the standard **AIAST** security label
  (`http://terminology.hl7.org/CodeSystem/v3-ObservationValue` code `AIAST`,
  "Artificial Intelligence asserted") in `meta.security`, per the AI
  Transparency on FHIR IG's first-level tagging.
- Implementations SHOULD emit a **Provenance** resource targeting the created
  resource, with the agent software as an `author` agent and the reviewer as
  a `verifier` agent (`http://terminology.hl7.org/CodeSystem/provenance-participant-type`),
  aligning with the same IG's pattern for AI-produced, human-verified data.
- Implementations MAY additionally tag writes with an implementation-specific
  `meta.tag` for cheap `_tag` discovery (this repository uses
  `https://lastehr.com/mcp|approved-proposal` on MCP writes and per-session
  tags on demo writes).
- Denials MAY be recorded as **AuditEvent** resources (this repository's
  opt-in rejected-proposal trail records `action: C, outcome: 4` with the
  tool name and no proposed chart content).

### 5. Isolation (optional profile for shared deployments)

Deployments where multiple anonymous reviewers share one FHIR project (public
demos, evaluation sandboxes) SHOULD tag every agent write with a per-session
`meta.tag` and filter reads so a session sees baseline data plus only its own
writes. Servers differ in `_tag:not` support; implementations MUST keep
isolation correct under honor, silent-ignore, and loud-reject behaviors
(this repository queries tagged and untagged sets separately and filters
fetched rows as a fallback).

## Conformance

Two suites check these mechanics today. The
[FHIR Agent Safety Eval](./evals.md) is the seed suite for this
repository's web binding. **`@lastehr/agent-write-conformance`**
([packages/conformance](https://github.com/cbetz/last-ehr/tree/main/packages/conformance))
is the standalone suite for the protocol's generic wire binding today:
an MCP stdio client with a scripted reviewer that drives an implementing
server (declared via a small manifest) and verifies every outcome
against the FHIR store with its own reads —
capability gating, proposal-before-persistence (probed during
deliberation), boolean-only decision shape, approve/deny/cancel/
unapproved/transport-failure outcomes, and commit fidelity. The seed
suite's deterministic checks map to the requirements above:

| Requirement | Eval check |
| --- | --- |
| Writes cannot execute without the gate | `proposal-gate` |
| Approval commits exactly once | `approved-write` |
| Denial commits nothing | `denied-write` |
| Session isolation (optional profile) | `chart-association-isolation` |
| Synthetic-target hygiene | `synthetic-target`, `cleanup` |

The approved-write check runs with any configured policy permitting the
tested write; policy denial paths are exercised separately and are not
exempt from proposal-gate or denied-write mechanics.

An implementation that cannot pass these mechanics is not implementing this
protocol, whatever its UI shows. The suite is deliberately narrow: passing it
proves gate mechanics, not clinical correctness, prompt-injection immunity,
or authorization — see the eval's own boundary statements.

## Bindings (non-normative)

Two bindings run in this repository today:

- **Web / AI SDK** — the tool declares `needsApproval`; the SDK pauses before
  execute; the approval card renders the exact fields, a diff of the
  proposed resource, and the resources the agent cited or the conversation
  already read; an explicit approve/deny response resumes the flow
  (`lib/ai/tools.ts`, `components/chat/confirm-write.tsx`).
- **MCP** — write tools are offered only to clients declaring form
  elicitation; each call pauses on an elicitation carrying the exact-fields
  summary, the same diff and evidence, and a single "Approve and save?"
  boolean; only `accept` + `approve: true` commits (`@lastehr/mcp`,
  [docs/mcp.md](./mcp.md)). After that approval, the server re-reads each
  cited resource and, for a superseding observation, the observation being
  replaced, and commits nothing if a version changed or a read failed. The
  decision exchange sits behind one adapter so MCP transport revisions
  change nothing semantic.

Both bindings accept an optional `evidence` or `basedOn` list of
`ResourceType/id` values on the write tools. Calls without that list still
propose the write. A proposal that cites nothing is flagged in the review.
The citation is review metadata: it is not part of the committed resource,
and the flag does not decide the write.

Other plausible bindings — CDS Hooks cards with suggestion feedback, agent
frameworks with native approval pauses (e.g. Vercel's eve), LangGraph
interrupts — need only satisfy the five sections above.

## Out of scope in v0.1

Agent identity and delegation (see SMART App Launch and IETF's emerging
agent-auth drafts), consent, terminology validation, editable proposals
(changing fields between rendering and commit breaks section 3 unless the
edited proposal is re-rendered and re-decided), batch approval, and any
autonomous-write carve-out. Updates and deletes are excluded until the
protocol has field experience with creates.

## Security considerations

Fail closed is the invariant every section serves: unknown decision states
deny; hosts without approval capability never see write tools; transport
failures deny without blaming a reviewer; results never carry backend
diagnostics. Free text loaded from charts is data, never instructions, and
crosses model boundaries inside an explicit delimiter. The decision request
itself must stay boolean-shaped — a protocol that elicits *data* during
approval invites the sensitive-information leaks the MCP specification
already forbids.
