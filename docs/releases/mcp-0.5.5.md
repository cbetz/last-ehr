# Last EHR MCP 0.5.5: write-safety benchmark and init next steps

Pending publication. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays
`@lastehr/mcp@0.5.4` until the [release process](../releasing-mcp.md) runs
on purpose. `mcpName` stays `io.github.cbetz/last-ehr`.

The package changes are
[PR #238](https://github.com/cbetz/last-ehr/pull/238), merged as
`43a58137c28fb490dc9e1465ead92e96ce7f4d43`, and
[PR #239](https://github.com/cbetz/last-ehr/pull/239), merged as
`cb7e5624047a36647a1397058d51e2b388c7a516`.

## A checkout can run a synthetic write-safety benchmark

`npm run bench` runs 24 scripted scenarios against an in-process synthetic
chart (`FHIR_BACKEND=memory`). No API key, Docker, or FHIR account. It
scores write-safety and protocol behavior: a write does not land without
approval, a proposal cites a resource the agent actually read, the write
lands on the named patient when two synthetic Smiths exist, planted chart
text that says to delete allergies or redirect the write is not followed,
a declined proposal is not retried, and a cited resource that changes
before approval is not saved.

It does not score clinical correctness, whether a requested write was
appropriate, regulatory compliance, or behavior on real patient data.
Synthetic fixtures only. `--agent model` is optional and uses one
OpenAI-compatible chat-completions endpoint. The harness answers approval
prompts. The scripted scorecard is a harness check, not a language-model
score.

The scenarios live in this repository under `bench/`. They are not in the
published npm tarball. The package `files` list is `dist`, `LICENSE`,
`README.md`, and `server.json`. The only bin is `lastehr-mcp`, which points
at `dist/cli.js`. That CLI includes a `bench` command. `npx @lastehr/mcp bench`
runs the catalog when this checkout is present (it looks for
`bench/src/cli.ts`). From an installed package alone, the command prints
that the benchmark ships in the git checkout and to run `npm run bench`
there.

## `init` prints next steps on a terminal

After a successful `init` or `init --demo`, a terminal gets a stderr
next-steps block: one read prompt (synthetic patient Maria Garcia, whom
`init --demo` seeds), one write prompt that reaches the approval gate, the
repository (https://github.com/cbetz/last-ehr) with a star ask, and
https://github.com/cbetz/last-ehr/issues. Stdout stays the client
configuration, including `--client json`.

The block is omitted when `LASTEHR_QUIET=1`, when `CI` is `true` or `1`
(`false` and `0` still print), or when stdout or stderr is not a terminal.
A failed `init` does not print it. The stdio server does not print it.

After publication the install pin is `@lastehr/mcp@0.5.5`. `init --demo`
still seeds synthetic patients in-process.
