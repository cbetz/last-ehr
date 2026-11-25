# Last EHR MCP 0.5.5: write-safety benchmark and init next steps

Published November 17, 2026. npm `latest` is `@lastehr/mcp@0.5.5`. The
Official MCP Registry record for `io.github.cbetz/last-ehr` marks `0.5.5`
`isLatest` (checked 2026-11-25 against registry.modelcontextprotocol.io).
The [GitHub release](https://github.com/cbetz/last-ehr/releases/tag/mcp-v0.5.5)
is tag `mcp-v0.5.5` at
`4e4fc22400d8791a1936596d415dba9262f0ff61`. `mcpName` stays
`io.github.cbetz/last-ehr`.

The package changes are
[PR #238](https://github.com/cbetz/last-ehr/pull/238), merged as
`43a58137c28fb490dc9e1465ead92e96ce7f4d43`, and
[PR #239](https://github.com/cbetz/last-ehr/pull/239), merged as
`cb7e5624047a36647a1397058d51e2b388c7a516`.

## Synthetic write-safety benchmark

From a checkout, `npm run bench` runs 24 scripted scenarios against
`@lastehr/mcp` with `FHIR_BACKEND=memory`. No API key, Docker, or FHIR
account. The harness answers approval prompts. The scripted scorecard is a
harness check, not a language-model score.

The checks are write-safety and protocol behavior: a write is not saved
without approval, a citation names a resource the agent read, the write
lands on the named patient when two synthetic patients share a family
name, planted chart text is not followed, a declined proposal is not
retried, and a cited resource that changed before approval is not saved.

The benchmark does not score clinical correctness, whether a requested
write was appropriate, regulatory compliance, or behavior on real patient
data. Synthetic fixtures only.

The scenarios live in this repository. The published npm tarball does not
include them. When this checkout is present, the MCP CLI `bench`
subcommand runs the same catalog.

## Init next steps

After a successful `init`, including `init --demo`, a terminal prints a
next-steps block on stderr. The block has one read prompt (synthetic
patient Maria Garcia), one write prompt that reaches the approval gate,
https://github.com/cbetz/last-ehr with a star ask, and
https://github.com/cbetz/last-ehr/issues.

Stdout stays the client configuration, including `--client json`. The
block is omitted when `LASTEHR_QUIET=1`, when `CI` is `true` or `1`, or
when stdout or stderr is not a terminal. `CI=false` and `CI=0` still
print it. A failed `init` does not print it. The stdio server does not
print it.

The install pin for this release is `@lastehr/mcp@0.5.5`. Quickstart
commands in the repository README use the unpinned `@lastehr/mcp` package
name. `init` still prints a pin for the version that ran it.
