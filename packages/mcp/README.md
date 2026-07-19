# @lastehr/mcp

FHIR chart tools for MCP clients, over a Medplum project or the Last EHR
repository's local HAPI evaluation stack (`FHIR_BACKEND=hapi`, synthetic
data only). This package is the smallest installable Last EHR surface:
read-only by default (search patients, show a chart), with one opt-in —
`LASTEHR_MCP_WRITES=proposal` — that adds elicitation-gated write proposals
a human approves per action. Nothing is ever saved without that explicit
approval, and the write tools are hidden from clients that cannot render
approvals.

The registry metadata lives in [`server.json`](./server.json) and is published
alongside each verified npm release.

## Install

```bash
npx -y @lastehr/mcp init
```

The command prints a portable MCP configuration. For Claude Code, print the
registration command instead:

```bash
npx -y @lastehr/mcp init --client claude-code
```

Start the stdio server with:

```bash
npx -y @lastehr/mcp
```

## Configuration

Set one authentication method before starting the server:

```bash
MEDPLUM_ACCESS_TOKEN=...
```

or:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
```

Set `MEDPLUM_BASE_URL` for a self-hosted Medplum deployment. For the
repository's local no-auth HAPI stack, set `FHIR_BACKEND=hapi` and
`FHIR_BASE_URL` (or `HAPI_BASE_URL`) instead — local, synthetic data only.
Run `npx -y @lastehr/mcp doctor` to validate configuration without starting
MCP.

## Safety boundary

By default the package exposes only `search_patients` and
`show_patient_info`, both with the MCP `readOnlyHint`. With
`LASTEHR_MCP_WRITES=proposal` it additionally offers `add_note`,
`record_observation`, and `create_task` as proposals: the exact fields are shown to the human
through MCP elicitation and nothing is saved unless they approve; every
approved write is tagged `https://lastehr.com/mcp|approved-proposal` and
carries the standard AIAST security label ("Artificial Intelligence
asserted") in `meta.security`, and `LASTEHR_WRITE_PROVENANCE=true` also
emits a Provenance resource naming the agent as author and the reviewer as
verifier.
Read access can still return PHI. Use a least-privilege identity, review the
MCP client's data handling and model-provider agreements, and never treat
this package as an authorization layer.

See https://www.lastehr.com/docs/mcp for the complete setup and support
boundary.
