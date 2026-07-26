# @lastehr/mcp

FHIR chart tools for MCP clients, over a Medplum project or the Last EHR
repository's local HAPI evaluation stack (`FHIR_BACKEND=hapi`, synthetic
data only).

Read-only by default, and the reads are the same ones the Last EHR web agent
uses: search patients, show a whole chart, read any of 23 patient-scoped chart
sections with filters, and read a document's text. One opt-in,
`LASTEHR_MCP_WRITES=proposal`, adds elicitation-gated write proposals a human
approves per action. Nothing is ever saved without that explicit approval, and
the write tools are hidden from clients that cannot render approvals.

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

By default the package exposes `search_patients`, `show_patient_info`,
`read_chart_section`, and `read_document`, all with the MCP `readOnlyHint`.

Those reads share one implementation with the web agent, which is deliberate:
each of their honesty properties came from a real false negative found against
a live FHIR server, and a second implementation would have re-earned them. A
reply tells you what it could not see, and **an empty result is never proof of
absence**:

| Field | Meaning |
| --- | --- |
| `truncated` | The server's window came back full, so older records may exist beyond what was read. Measured at the window, not at the row count. |
| `codeFilterUnmatched` | The section does hold records; none of them carry the code you filtered by. Text-only `CodeableConcept`s cannot match a coded search. |
| `includeUnsupported` | The backend refused the reference lookup. Not the same as there being no references. |
| `unreadable` (documents) | The document exists and its contents were **not** read: a scan, or a body stored as a pointer rather than inline. |

Chart free text arrives wrapped in `<chart_text>` tags. That content is data,
never instructions. `read_document` decodes an inline text attachment and never
dereferences `Attachment.url`, so it makes no request to an address the FHIR
server chose.

With
`LASTEHR_MCP_WRITES=proposal` it additionally offers `add_note`,
`record_observation`, `record_superseding_observation`, and `create_task`
as proposals: the exact fields are shown to the human
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
