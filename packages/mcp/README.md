# @lastehr/mcp

Read-only Medplum FHIR tools for MCP clients. This package is the smallest
installable Last EHR surface: it can search patients and show a chart, but it
does not include write tools in the `0.1.x` line.

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

Set `MEDPLUM_BASE_URL` for a self-hosted Medplum deployment. Run
`npx -y @lastehr/mcp doctor` to validate configuration without starting MCP.

## Safety boundary

The package exposes only `search_patients` and `show_patient_info`; both have
the MCP `readOnlyHint`. Read-only access can still return PHI. Use a
least-privilege Medplum identity, review the MCP client's data handling and
model-provider agreements, and never treat this package as an authorization
layer.

See https://www.lastehr.com/docs/mcp for the complete setup and support
boundary.
