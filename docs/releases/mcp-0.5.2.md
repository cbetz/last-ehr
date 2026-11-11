# Last EHR MCP 0.5.2: stderr next steps after init and doctor

This is a draft. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays
`@lastehr/mcp@0.5.1` until the [release process](../releasing-mcp.md) runs
on purpose. `mcpName` stays `io.github.cbetz/last-ehr`.

The package change is [PR #226](https://github.com/cbetz/last-ehr/pull/226).
This is not a clinical, regulatory, or compliance claim.

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
