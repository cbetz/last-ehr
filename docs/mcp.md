# MCP Server

`@lastehr/mcp` is the smallest installable Last EHR surface: a Medplum-only,
read-only MCP server for searching patients and opening a chart. It is
deliberately separate from the web app, where writes are proposal-shaped and
approval-gated.

## Install and connect

```bash
npx -y @lastehr/mcp init
```

The command prints a portable MCP configuration. Add a least-privilege token,
then place the result in your MCP client's configuration:

```json
{
  "mcpServers": {
    "lastehr": {
      "command": "npx",
      "args": ["-y", "@lastehr/mcp"],
      "env": {
        "MEDPLUM_ACCESS_TOKEN": "<replace-with-a-least-privilege-token>"
      }
    }
  }
}
```

For Claude Code, print the registration command instead:

```bash
npx -y @lastehr/mcp init --client claude-code
```

The process inherits `MEDPLUM_*` variables from your shell or MCP client
configuration. Start it directly with `npx -y @lastehr/mcp` when you want to
test a stdio connection yourself.

## Auth

The package uses Medplum credentials:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
```

or:

```bash
MEDPLUM_ACCESS_TOKEN=...
```

Set `MEDPLUM_BASE_URL` for self-hosted Medplum.

## Registry metadata

The package is listed in the [Official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.cbetz%2Flast-ehr), the client-facing installation record for the verified npm release.

Maintainers publish that immutable record through the manual `Publish MCP Registry metadata` GitHub Actions workflow after the corresponding npm version is public.

## Tool surface

The published `0.1.x` package exposes exactly two tools, both marked with MCP's
`readOnlyHint`:

- `search_patients`
- `show_patient_info`

There is no environment switch that exposes write tools. A write-capable MCP
surface would need a proposal protocol and a separate safety review before it
is considered for a future release.

## Data and support boundary

Read-only does not mean low-risk: `show_patient_info` can return PHI-rich
chart data. Use the smallest Medplum AccessPolicy that meets the task, confirm
that your MCP client and model provider are appropriate for the data, and do
not treat this package as an authorization layer.

`@lastehr/mcp` supports hosted or self-hosted **Medplum** authentication today.
It does not claim generic FHIR, HAPI, SMART launch, or browser-approval parity.
See the [support matrix](./support.md) for the complete boundary.

## From a checkout

The repository includes the same package for contributors:

```bash
npm run mcp
```

This builds `@lastehr/mcp` and starts the two read-only tools using your local
Medplum environment variables.

## Roadmap

- Better read-tool coverage where it can stay bounded and auditable.
- Proposal-shaped writes only if MCP clients support a reviewable confirmation
  protocol.
