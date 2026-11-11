# Last EHR MCP 0.5.2: proposed writes beside cited and read resources

This is a draft. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays
`@lastehr/mcp@0.5.1` until the [release process](../releasing-mcp.md) runs
on purpose. `mcpName` stays `io.github.cbetz/last-ehr`.

The package changes are
[PR #228](https://github.com/cbetz/last-ehr/pull/228),
[PR #229](https://github.com/cbetz/last-ehr/pull/229), and
[PR #226](https://github.com/cbetz/last-ehr/pull/226). This is not a
clinical, regulatory, or compliance claim. The evidence list does not check
that a proposal follows from the cited resources.

## Evidence beside the diff

`add_note`, `record_observation`, `record_superseding_observation`, and
`create_task` take an optional `evidence` or `basedOn` list. Each item is a
`ResourceType/id` from an earlier read, or `{ reference, reason }`. If both
lists are set, they are combined. Omitting the list still proposes the
write. Citations are not stored on the FHIR resource. A missing citation
does not approve or deny the write.

The MCP session records chart resources its read tools returned. The
approval prompt shows a diff of the resource that would be created, the
cited list, and those session reads. A proposal with no citation says
"No cited evidence." A citation that was not read in the session is marked
"Not in this session's reads." The web approval card shows the same
comparison. An embedder that does not pass a session log omits the read
list rather than claiming nothing was read.

## stderr next steps

When stderr is a terminal and `LASTEHR_QUIET` is not `1`:

- `init` prints the next `doctor` command, https://www.lastehr.com/docs/mcp,
  and https://github.com/cbetz/last-ehr. `init` stdout is still only the
  client configuration. A sandbox backend still prints its setup guide on
  stderr before those lines.
- A passing `doctor` prints the repository line.
- A failing `doctor` prints the issues URL,
  https://github.com/cbetz/last-ehr/issues.

A non-terminal stderr omits the lines, so CI and piped output stay quiet.
The stdio server does not print them. `init` and `doctor` do not contact
GitHub.

## Catalog before credentials

The stdio server answers `initialize` and `tools/list` without backend
credentials. The first tool call returns an `isError` result that names
the missing or invalid variable and points at `init` and `doctor`. Write
tools stay hidden unless `LASTEHR_MCP_WRITES=proposal`. The approval gate
is unchanged ([PR #229](https://github.com/cbetz/last-ehr/pull/229)).

## Since published 0.5.1, outside the package

- The site adds an alphabetical, sourced comparison of open-source FHIR MCP
  servers and a public homepage FAQ
  ([PR #225](https://github.com/cbetz/last-ehr/pull/225)).
- The homepage plays the 90-second approve-and-decline recording
  ([PR #224](https://github.com/cbetz/last-ehr/pull/224)). That recording,
  poster, captions, and FHIR proof were re-captured from clean source
  `fb2473246c59` / published `@lastehr/mcp@0.5.1`
  ([PR #222](https://github.com/cbetz/last-ehr/pull/222)). Synthetic HAPI
  data. The earlier public file was the October 23 take from `f36d05d` /
  `0.4.0`.
