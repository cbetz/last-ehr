# @lastehr/agent-write-conformance

Conformance suite for **[Approval-Gated Agent Writes on FHIR](https://www.lastehr.com/docs/agent-write-protocol)** (v0.1 draft): a small, framework-neutral protocol where every agent-initiated chart write is a proposal a human explicitly decides on before it commits.

The suite is an MCP stdio **client** with a scripted reviewer. It spawns your server fresh for every scenario, answers your elicitation prompts each possible way — approve, decline, cancel, accept-without-approving, transport failure, and a client that never declared the capability — and verifies every outcome against the FHIR store **with its own reads**, never your tool results' word for it.

## Run it

```bash
npx @lastehr/agent-write-conformance \
  --server "node ./dist/my-mcp-server.js" \
  --manifest ./awp-manifest.json \
  --fhir-base-url http://localhost:8080/fhir \
  --confirm-synthetic \
  --report ./awp-report.json
```

`--confirm-synthetic` is required: the suite creates and deletes resources — and its persistence sweeps diff **whole resource types**, so a misrouted write cannot hide under the wrong patient — which means the target must be a disposable synthetic store, never real or shared data. Bearer auth for the probe comes from `AWP_FHIR_BEARER_TOKEN` in the environment. Your server command and the probe must point at the same store, and should exec a single server process (a compound shell command can leave grandchildren running when a scenario's connection closes).

The manifest declares each write tool's name, a valid argument template (`$PATIENT_ID` and `$NONCE` are substituted per scenario), what it creates, and where the patient reference lands — see [examples/lastehr-mcp.awp-manifest.json](./examples/lastehr-mcp.awp-manifest.json), which is the manifest this repository's own `@lastehr/mcp` write profile passes with.

## Checks (v0.1)

| id | level | proves |
| --- | --- | --- |
| `synthetic-target` | hygiene | The suite could create its tagged disposable patient. |
| `capability-gate` | must | Without the elicitation capability, write tools are unlisted and a call anyway persists nothing (spec §2). |
| `proposal-gate` | must | An invoked write tool produces a proposal, and sampled probes *during* deliberation and after a denial find nothing persisted (spec §1). |
| `decision-shape` | must | The decision exchange requests booleans only, never data (spec §2). |
| `proposal-renders-inputs` | partial | Every argument value appears in the proposal text (presence, not completeness of rendering — spec §1). |
| `approved-write` | must | Explicit approval commits exactly once, with the proposed values, on the right patient, reporting the server-assigned id (spec §2–3). |
| `denied-write` | must | Decline, cancel, and an unapproved accept each leave no new resource of the write's type anywhere in the store, and say so (spec §2). |
| `unavailable-write` | must | A decision exchange that fails in transit fails closed (spec §2). |
| `cleanup` | hygiene | Everything the suite created was deleted. |

## What passing means — and doesn't

Passing proves **gate mechanics against this suite's scripted reviewer**. It does not prove clinical correctness, prompt-injection immunity, or authorization, and several spec requirements are attestation-only — the report's `attestations` block lists every one, including: tool code builds FHIR from validated capped inputs; the rendering is complete, not just present; no other approval path exists; unlisted tools follow the same gate; and persistence probing is point-sampled, so a write-then-rollback implementation racing the probes violates the spec but can evade detection. The report is deliberately scrub-clean — static detail strings only, no ids, endpoints, or error text — so it is safe to publish (check failures print their diagnostics to your terminal instead).

The suite versions against exactly one spec version per release (this release: spec v0.1 draft). The default result contract (JSON text with a boolean `saved` and the id) matches `@lastehr/mcp` and is non-normative in v0.1.

## License

Apache-2.0. Part of [Last EHR](https://github.com/cbetz/last-ehr).
