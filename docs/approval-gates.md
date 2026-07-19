# Approval-Gated Writes

Approval-gated writes are the core product pattern in Last EHR.

The agent can read immediately, but it cannot write to the chart through the
web app until the user approves the proposed write. The pattern is now also
specified as a small framework-neutral protocol —
[Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md) (v0.1
draft) — with this page's approval card and the MCP write profile as its two
reference bindings.

## Current behavior

Write tools in `lib/ai/tools.ts` set `needsApproval: true`:

- `add_note`
- `record_observation`

When the model calls one of those tools:

1. The SDK pauses before `execute`.
2. The UI renders an approval card.
3. The card shows the exact fields the tool proposed.
4. Cancel drops the proposal.
5. Approve runs `execute` and writes to the backend.
6. The backend still enforces its own access policy.

## What the gate protects

- Unilateral agent writes.
- Accidental silent mutation of the chart.
- Some prompt-injection paths that try to force a write.

## What the gate does not protect

- Reads. Chart context still goes to the model provider.
- Hallucinated content that a user approves without reading.
- Approval fatigue.
- Backend access control. The backend remains the security boundary.

## Rejected-proposal audit events (opt-in)

An approved write leaves its own evidence: the created resource. A denial
leaves nothing on the chart by design. Deployments that need to show "the
agent proposed a write and a person said no" can set:

```bash
LASTEHR_AUDIT_REJECTED_PROPOSALS=true
```

Each denial then writes one FHIR `AuditEvent` to the configured backend: an
attempted RESTful create with outcome `4` (blocked before execution), the
tool name, the patient reference, and the approval id. The proposed content
itself is deliberately not copied into the event, so the audit trail never
becomes a second, unreviewed home for rejected text. On the shared demo the
events carry the same session tag as other writes. Audit failures are logged
and never block the chat turn.

## Write policy (optional tightening)

The approval gate can be narrowed, never widened. A deployment can
statically disable write tools with `LASTEHR_WRITE_TOOLS_DISABLED`
(comma-separated tool names): the model is never offered a disabled write
(it is hidden from the tool list and the system prompt), and anything that
still reaches it — a stale approval card from before a config flip — is
denied at commit and attributed to configuration. Embedders can also pass
a dynamic, deny-only policy hook (`writePolicy` in the web agent's
`BuildToolsOptions`, `policy` in the MCP package's `WriteToolOptions`): it
fails closed on any error or malformed result, and its only power is to
veto — a policy outcome is never an approval, and a policy denial is never
attributed to the reviewer. The MCP binding evaluates the hook before the
reviewer is asked and re-checks at commit; the web binding evaluates it at
commit only (the AI SDK offers no safe pre-card veto point today), so a
dynamically denied web proposal renders a card whose approval then fails
with the policy message. The
[protocol's Decision section](./agent-write-protocol.md#2-decision)
specifies these rules.

Approved writes are attributable too: every one carries the standard
**AIAST** security label ("Artificial Intelligence asserted") in
`meta.security`, and setting `LASTEHR_WRITE_PROVENANCE=true` additionally
emits a `Provenance` resource naming the agent as author and the reviewing
human as verifier, following the HL7 AI Transparency on FHIR IG. The
[protocol's Audit section](./agent-write-protocol.md#4-audit) specifies both.

## Product backlog

The approval experience should become more inspectable without becoming noisy:

- FHIR preview in the card.
- Editable draft proposals with explicit re-review before save.
- Approval policies by resource type, environment, user role, or SMART scope.
- Batch review for low-risk resources, if it can avoid approval fatigue.

High-risk resource types need stronger review than one confirm button.
