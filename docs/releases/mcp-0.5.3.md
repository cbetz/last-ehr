# Last EHR MCP 0.5.3: in-process synthetic FHIR store

Pending publication. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays
`@lastehr/mcp@0.5.2` until the [release process](../releasing-mcp.md) runs
on purpose. `mcpName` stays `io.github.cbetz/last-ehr`.

The package change is
[PR #232](https://github.com/cbetz/last-ehr/pull/232). Synthetic data only.
This is not a clinical, regulatory, or compliance claim.

## Zero-setup demo

`FHIR_BACKEND=memory` selects an in-process synthetic FHIR store.
`init --demo` prints a config that sets that backend and
`LASTEHR_MCP_WRITES=proposal`. It composes with `--client json` (the
default), `claude-code`, and `cursor`.

After publication:

```bash
npx -y @lastehr/mcp@0.5.3 init --demo
npx -y @lastehr/mcp@0.5.3 init --demo --client claude-code
npx -y @lastehr/mcp@0.5.3 init --demo --client cursor
```

`init --demo` runs synthetic seed patients in-process, and approved writes
vanish when the process exits. No Medplum account, token, or Docker.
Startup loads the same synthetic fixtures `npm run seed` writes. Server
instructions and the saved-write result say this is not a chart on a FHIR
server. `doctor` and `doctor --connect` report the store ready and do not
contact a server. Leaving `FHIR_BACKEND` unset still selects Medplum.

`LASTEHR_MCP_TRANSPORT=http` is refused. The store has no authentication,
so a remote transport in front of it would expose an unauthenticated chart
API.

## What the store implements

The behavioral backend contract passes in-process, including `meta.tag`
persistence, `_id`, `identifier`, `_tag`, `_tag:not` (including a bare
system token), and delete.

Differences, rejected or documented rather than ignored:

- The store is not an HTTP server, so the REST wire contract (headers,
  CapabilityStatement, OperationOutcome bodies) does not apply.
- No `Bundle.link` paging. `_count` returns the first page and drops the
  rest. Omitting `_count` returns every match.
- `_include` and `_revinclude` are rejected. The chart reader reports
  `includeUnsupported` and retries without them.
- Search parameters outside the chart-read subset are rejected.
- `patient` and `subject` match a top-level `subject`, `patient`, `for`,
  or `beneficiary` reference. Nested references such as `AuditEvent.agent`
  are not matched.
- `name` matches when each word is a case-insensitive prefix of some
  HumanName part.
- Date filters compare the bound's calendar precision to the start of the
  stored datetime.
