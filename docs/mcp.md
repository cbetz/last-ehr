# MCP Server

Last EHR exposes the same chart tools over MCP:

```bash
npm run mcp
```

The server uses stdio and can be registered with Claude Desktop, Claude Code,
or another MCP client.

## Auth

The MCP server currently uses Medplum credentials:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
```

or:

```bash
MEDPLUM_ACCESS_TOKEN=...
```

Set `MEDPLUM_BASE_URL` for self-hosted Medplum.

## Read-only default

The MCP server starts read-only. It exposes:

- `search_patients`
- `show_patient_info`

Set this to expose writes:

```bash
LASTEHR_MCP_WRITES=true
```

Then it also exposes:

- `add_note`
- `record_observation`

There is no Last EHR approval card over MCP. The MCP client's own tool prompt
is the only gate, so every approved write saves directly to the chart.

## Claude Code example

```bash
claude mcp add lastehr -- npm --prefix /path/to/last-ehr run mcp
```

## Roadmap

- Backend parity with the web app.
- Clearer write-risk annotations.
- A separate package once the tool surface stabilizes.
- Optional approval/proposal protocols if MCP clients standardize them.
