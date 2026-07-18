# @lastehr/mcp

Read-only FHIR chart tools for MCP clients, over a Medplum project or the
Last EHR repository's local HAPI evaluation stack (`FHIR_BACKEND=hapi`,
synthetic data only). This package is the smallest installable Last EHR
surface: it can search patients and show a chart, but it does not include
write tools in the `0.1.x` line.

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

The package exposes only `search_patients` and `show_patient_info`; both have
the MCP `readOnlyHint`. Read-only access can still return PHI. Use a
least-privilege Medplum identity, review the MCP client's data handling and
model-provider agreements, and never treat this package as an authorization
layer.

See https://www.lastehr.com/docs/mcp for the complete setup and support
boundary.
