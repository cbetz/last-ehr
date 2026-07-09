# Approval-Gated Writes

Approval-gated writes are the core product pattern in Last EHR.

The agent can read immediately, but it cannot write to the chart through the
web app until the user approves the proposed write.

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

## Product backlog

The approval experience should become more inspectable without becoming noisy:

- FHIR preview in the card.
- Editable draft proposals with explicit re-review before save.
- Rejected-proposal audit events as an opt-in deployment feature.
- Approval policies by resource type, environment, user role, or SMART scope.
- Batch review for low-risk resources, if it can avoid approval fatigue.

High-risk resource types need stronger review than one confirm button.
