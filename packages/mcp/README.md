# @lastehr/mcp

Open-source MCP server for FHIR charts. Read tools are on by default; every write waits for a person to approve it.

[![90-second synthetic walkthrough: approve one write, then decline the next](https://www.lastehr.com/demo/approve-and-decline.jpg)](https://www.lastehr.com/demo/approve-and-decline.mp4)

**[Star this project on GitHub](https://github.com/cbetz/last-ehr)** — the source, issues, and the recording above.

FHIR chart tools for MCP clients. `init --demo` runs synthetic seed patients
in-process (`FHIR_BACKEND=memory`): no Medplum account, token, or Docker, and
approved writes vanish when the process exits. The same package also talks to
a Medplum project, the Last EHR repository's local HAPI evaluation stack
(`FHIR_BACKEND=hapi`, synthetic data only), or — with
`LASTEHR_EXPERIMENTAL_FHIR_ADAPTERS=1` — the Epic and Oracle Health sandboxes
(`LASTEHR_BACKEND=epic|oracle`) and a generic SMART Backend Services server
(`LASTEHR_BACKEND=smart`). The sandboxes do not support delete, so an approved
write persists. Synthetic data only. This is not a clinical or compliance
claim.

Read-only by default, and the reads are the same ones the Last EHR web agent
uses: search patients, show a whole chart, read any of 23 patient-scoped chart
sections with filters, and read a document's text. One opt-in,
`LASTEHR_MCP_WRITES=proposal`, adds elicitation-gated write proposals a human
approves per action. The approval prompt shows a diff of the proposed
resource beside any resources the agent cited (`evidence` or `basedOn`) and
the resources that session already read. A proposal that cites nothing says
so. Nothing is ever saved without that explicit approval, and the write
tools are hidden from clients that cannot render approvals.

The registry metadata lives in [`server.json`](./server.json) and is published
alongside each verified npm release.

## Zero-setup demo

npm `latest` is `@lastehr/mcp@0.5.3`. The Official MCP Registry record for
`io.github.cbetz/last-ehr` marks `0.5.3` `isLatest`.

```bash
npx -y @lastehr/mcp@0.5.3 init --demo
npx -y @lastehr/mcp@0.5.3 init --demo --client claude-code
npx -y @lastehr/mcp@0.5.3 init --demo --client cursor
```

`init --demo` runs synthetic seed patients in-process, and approved writes
vanish when the process exits. Synthetic data only. This is not a clinical
or compliance claim.

The printed config sets `FHIR_BACKEND=memory` and
`LASTEHR_MCP_WRITES=proposal`. `--client cursor` adds `"type": "stdio"`.
The default JSON output and `--client cursor` set the same env. Leaving
`FHIR_BACKEND` unset still selects Medplum.

Server instructions and the saved-write result say this is not a chart on
a FHIR server. `doctor` and `doctor --connect` report the store ready and
do not contact a server. `LASTEHR_MCP_TRANSPORT=http` is refused.

The store passes the behavioral backend contract (`meta.tag` persistence,
`_id`, `identifier`, `_tag`, `_tag:not`, delete). It does not speak HTTP,
so the REST adapter wire contract does not apply. There is no `Bundle.link`
next page. `_include` and `_revinclude` are rejected, and the chart reader
reports `includeUnsupported`. Search parameters outside the chart-read
subset are rejected rather than ignored. `patient` and `subject` match a
top-level `subject`, `patient`, `for`, or `beneficiary` reference. A
multi-word `name` matches when each word is a prefix of some HumanName part.

## Install

These commands install `@lastehr/mcp@0.5.3`.

```bash
npx -y @lastehr/mcp@0.5.3 init
```

The command prints a portable MCP configuration. For Claude Code, print the
registration command instead:

```bash
npx -y @lastehr/mcp@0.5.3 init --client claude-code
```

Start the stdio server with:

```bash
npx -y @lastehr/mcp@0.5.3
```

Check the installed package version without configuring a backend:

```bash
npx -y @lastehr/mcp@0.5.3 --version
```

## Configuration

Set one authentication method before calling a tool. The stdio server still starts, and `tools/list` still returns the full catalog, when this is missing or still the placeholder from `init`. The first tool call names the missing or invalid variable and points at `npx @lastehr/mcp init` and `npx @lastehr/mcp doctor`. `doctor` still rejects a missing credential.

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
Run `npx -y @lastehr/mcp@0.5.3 doctor` to validate configuration without starting
MCP.

When stderr is a terminal, `init` and a passing `doctor` print a short pointer
there: the docs (https://www.lastehr.com/docs/mcp) and the source
(https://github.com/cbetz/last-ehr). A failing `doctor` points at
https://github.com/cbetz/last-ehr/issues. `LASTEHR_QUIET=1` hides the pointer.
A non-terminal stderr hides it too, so CI stays quiet. The stdio server does
not print the pointer. `init` stdout stays the configuration text.

In `0.4.0`, `doctor --connect` also checks FHIR R4 metadata and a count-only
Patient search for the stdio backend. It makes no chart write and prints no
patient data or counts. This does not verify individual chart access, other
resource permissions, write permissions, or the MCP client's approval support.
HTTP mode remains configuration-only; its `--connect` check fails explicitly
rather than treating a configured URL as a verified OAuth session.

The source checkout can be ahead of npm. Check the installed version with
`--version`. The repository's [release process](https://github.com/cbetz/last-ehr/blob/main/docs/releasing-mcp.md)
tests the packed artifact in a clean directory before publication.

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
