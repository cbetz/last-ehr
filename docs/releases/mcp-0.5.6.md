# Last EHR MCP 0.5.6: batch review and an open write-safety benchmark

Published November 28, 2026. npm `latest` is `@lastehr/mcp@0.5.6`. The
Official MCP Registry record for `io.github.cbetz/last-ehr` marks `0.5.6`
`isLatest` (checked 2026-11-28 against registry.modelcontextprotocol.io).
The [GitHub release](https://github.com/cbetz/last-ehr/releases/tag/mcp-v0.5.6)
is tag `mcp-v0.5.6` at
`5dc36bd31a0815bbf1fd550f890a4750c531490a`. `mcpName` stays
`io.github.cbetz/last-ehr`.

The changes since `0.5.5` are
[PR #241](https://github.com/cbetz/last-ehr/pull/241), merged as
`7278e866c87daeeb2c37d478821390be29d76075`,
[PR #242](https://github.com/cbetz/last-ehr/pull/242), merged as
`5b06b77b92bc24a97c7bdb34428f3adefd776cb2`,
[PR #243](https://github.com/cbetz/last-ehr/pull/243), merged as
`22791a089043f373160f1857086d15e9f737a47e`, and
[PR #244](https://github.com/cbetz/last-ehr/pull/244), merged as
`e2f2221b9b3aaf380a47b7759be951988a099f07`.

## Batch review of pending write proposals

A single write still asks for approval on that call. To hold several
proposals, pass `holdForReview: true` on each write. Nothing is saved.

`list_pending_proposals` returns the queue grouped by patient, with the
same diff and citation flag as a single prompt. A proposal that cites
nothing is marked that way. The flag does not approve or deny the write.
The tool does not save anything.

`review_pending_proposals` asks the person to decide each held proposal.
The form has one approve-or-decline field per proposal, plus a control that
declines every proposal left unset. There is no approve-all. Submit saves
only the proposals set to approve. A proposal left unset stays pending.
Decisions come from the person's form, not from the tool arguments.

Each approved item is checked again at that moment: policy, the
cited-version re-read, and the attribution tag. One item failing does not
save or block the others. The result lists each item on its own.

The web app lists waiting proposals the same way: the reviewer decides
each one, and submit saves only the ones they approved.

The check compares versions. It does not decide that a proposal follows
from the cited rows. Not a clinical, regulatory, or compliance claim.
Synthetic data only.

The scripted benchmark adds two scenarios for this path. `npm run bench`
now runs 26 scenarios. A batch review saves only the items the harness
sets to approve. In a batch, only the item whose citation changed fails
the stale-evidence check.

## Open write-safety benchmark

`npm run bench` still starts the scripted agent against `@lastehr/mcp`
with `FHIR_BACKEND=memory`. No API key, Docker, or FHIR account. The
harness answers approval prompts. The scripted scorecard is a harness
check, not a language-model score.

`npm run bench:open` points the same scenarios at another stdio FHIR MCP
server. The harness starts the command, answers MCP elicitation when the
server sends it, and reads the synthetic chart through the FHIR REST API.
A scenario that cannot apply is n/a, not a fail. A server with no write
tools is not a lower score. The benchmark only measures what happens when
an agent writes.

`.github/workflows/bench-open.yml` runs a chosen config on
`workflow_dispatch` only. It does not run on pull requests.

Recorded runs from 2026-11-20, synthetic HAPI only, are in
[bench/RESULTS.md](../../bench/RESULTS.md). They are not a ranking. The
Last EHR row is the scripted harness check on that checkout
(`39ed36831e2f5ea2c98e00daabaa2cc10b30fa70`, package `0.5.5`). The WSO2
`fhir-mcp-server` 0.11.0 and LangCare MCP FHIR 2.5.0 rows are no-model
probes that each called one configured write. The chart changed, and
neither server sent an MCP elicitation prompt. The other categories were
not run. `the-momentum/fhir-mcp-server` was not run.

The benchmark does not score clinical correctness, whether a requested
write was appropriate, regulatory compliance, or behavior on real patient
data. Synthetic fixtures only.

## One-click install

The repository README has Add to Cursor and Install in VS Code links.
Both install the config `init --demo --client cursor` prints:
`FHIR_BACKEND=memory`, `LASTEHR_MCP_WRITES=proposal`, and `npx -y`
pinned to `@lastehr/mcp@0.5.6`. No account, token, or Docker. Approved
writes vanish when the process exits.

The same screen prints:

```bash
claude mcp add lastehr --env FHIR_BACKEND=memory --env LASTEHR_MCP_WRITES=proposal -- npx -y @lastehr/mcp
npx -y @lastehr/mcp init --demo
```

Those copy-paste lines stay unpinned. `init` still prints a pin for the
version that ran it. `lib/docs/readme-install.test.ts` decodes the buttons
and checks they match `init --demo`.

The README header also links the Glama listing for this repository.

The install pin for this release is `@lastehr/mcp@0.5.6`. Quickstart
commands in the repository README use the unpinned `@lastehr/mcp` package
name. `init` still prints a pin for the version that ran it.
