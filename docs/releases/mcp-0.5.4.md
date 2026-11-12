# Last EHR MCP 0.5.4: re-check cited evidence before a write is saved

Pending publication. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays
`@lastehr/mcp@0.5.3` until the [release process](../releasing-mcp.md) runs
on purpose. `mcpName` stays `io.github.cbetz/last-ehr`.

The package change is
[PR #235](https://github.com/cbetz/last-ehr/pull/235), merged as
`f419f3c206c40a0ae8818d12523cce28cb9a8ee4`.

## Cited evidence is re-read before the write is saved

Before an approved MCP write is saved, the server re-reads every resource
the agent cited as evidence. While the proposal is prepared, each citation
is pinned to the version from this session's read of it. A citation this
session has not retained is read then, and that read is the pin.

The pin is `meta.versionId` when the resource has one, otherwise
`meta.lastUpdated`, otherwise a SHA-256 of the resource JSON (object keys
sorted, array order kept). Medplum, HAPI, and the experimental adapters
supply `meta.versionId`. The in-process memory store
(`FHIR_BACKEND=memory`) assigns neither meta field, so it uses the content
hash.

After approval and before the create, each cited resource is read again.
If any is missing, deleted, or no longer that version, or the re-read
fails, nothing is saved and the tool result names the reference.

`record_superseding_observation` re-checks the observation it replaces the
same way, whether or not that observation was cited.

A proposal with no citation is unchanged. The check compares versions. It
does not decide that the proposal follows from the cited rows. Not a
clinical, regulatory, or compliance claim.

After publication the install pin is `@lastehr/mcp@0.5.4`. `init --demo`
is unchanged from 0.5.3.
