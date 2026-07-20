# Protocol Conformance Suite

`@lastehr/agent-write-conformance` is the standalone conformance suite for
[Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md) (v0.1
draft). It tests an *implementation* of the protocol — yours, not just this
repository's — over the protocol's generic wire binding today: an MCP stdio
server offering elicitation-gated write proposals.

The suite is the client side of that exchange with a scripted reviewer. It
spawns your server fresh for every scenario, answers your approval prompts
each possible way — approve, decline, cancel, accept-without-approving,
transport failure, and a client that never declared the capability — and
verifies every outcome against the FHIR store **with its own reads**, never
your tool results' word for it.

## Running it against your implementation

```bash
npx @lastehr/agent-write-conformance \
  --server "node ./dist/my-mcp-server.js" \
  --manifest ./awp-manifest.json \
  --fhir-base-url http://localhost:8080/fhir \
  --confirm-synthetic --strict \
  --report ./awp-report.json
```

`--confirm-synthetic` is required and means it: the suite creates and
deletes resources, and its persistence sweeps diff whole resource types so
a misrouted write cannot hide under the wrong patient — the target must be
a disposable synthetic store. The manifest declares each write tool's name,
a valid argument template, what it creates, and where the patient reference
lands; the [worked example](https://github.com/cbetz/last-ehr/blob/main/packages/conformance/examples/lastehr-mcp.awp-manifest.json)
is the manifest this repository's own `@lastehr/mcp` write profile passes
with — on every pull request and merge, in CI, in strict mode.

## What it checks

MUST-level: capability gating (a host that cannot render proposals is never
offered a write tool, and a call anyway persists nothing), the proposal
gate (probed *during* reviewer deliberation), boolean-only decision shape,
approved writes committing exactly once with the proposed values and a
truthful result id, all three denial variants persisting nothing and saying
so, and fail-closed behavior when the decision exchange itself fails.

SHOULD-level, counted only under `--strict`: the audit layer — the AIAST
security label on every approved write, and a Provenance resource naming
the agent as author and the reviewer as verifier.

A passing report proves **gate mechanics against a scripted reviewer**. It
does not prove clinical correctness, prompt-injection immunity, or
authorization, and the report's `attestations` block names every spec
requirement a mechanical suite cannot observe — including that persistence
probing is point-sampled, so a write-then-rollback implementation racing
the probes violates the spec but can evade detection. Reports carry static
detail strings only (no ids, endpoints, or error text) and stamp the suite
version, spec version, and strict mode, so they are safe to publish and
precise to cite.

## Relationship to the FHIR Agent Safety Eval

The [FHIR Agent Safety Eval](./evals.md) is this repository's own
web-binding eval: it drives the actual `buildTools` surface with a
deterministic scripted model and remains the seed suite the spec's
conformance table maps to. The conformance package is the
implementation-neutral counterpart — same disciplines (synthetic-target
hard gate, scrubbed reports, reverse-order cleanup), no shared code, and a
driver interface (the manifest) instead of this repository's internals.
Run the eval to check this app; run the conformance suite to check *an
implementation of the protocol*.
