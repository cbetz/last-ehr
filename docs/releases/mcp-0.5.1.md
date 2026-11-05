# Last EHR MCP 0.5.1: sandbox write bodies the servers accepted

This is a draft. Merging the version bump does not publish the package,
cut a tag, or open a GitHub release. npm `latest` stays on the last
published version until the [release process](../releasing-mcp.md) runs
on purpose. `0.5.0` was prepared in this checkout and was not published.

This patch is the fixes from
[PR #219](https://github.com/cbetz/last-ehr/pull/219). A live run of
`0.5.0` (`main@74b1ec5`) was rejected by the sandboxes. The bodies below
are the ones those servers had already accepted. Synthetic sandbox
patients only. This is not a clinical, regulatory, or compliance claim.

## Epic

A heart rate typed as `bpm` is posted with `valueQuantity.unit` `/min`
and UCUM code `/min`. `0.5.0` sent unit `bpm` with code `/min`. Epic
returned OperationOutcome `59102`: `Invalid unit given: bpm. Unit
expected: /min`.

The Epic sandbox write was re-verified live on this patch.

## Oracle Health

The oral-temperature body matches the create the sandbox accepted
(`Observation/VS-209196396`):

- display unit `degC`, UCUM code `Cel`
- `encounter` when `LASTEHR_ENCOUNTER` is set
- performer with `event-performerFunction` code `LA` (legal authenticator)
- no `meta.tag` unless `LASTEHR_INCLUDE_META_TAG=1`

`doctor` searches `Patient?_id=<LASTEHR_PATIENT_ID>`. Cerner returns
HTTP 400 for `Patient?_count=1` with no other parameter. That
unparameterized 400 is reported and does not fail the check, the same
way a missing search scope (HTTP 403) does not. `_count` is not sent
together with `_id`.

The Oracle live write is pending. Cerner's sandbox resource store is
returning HTTP 500s, so this patch has not been confirmed with a new
create on that host.

## Proof script

`scripts/sandbox-proof` prints OperationOutcome diagnostics (issue code,
diagnostics, and details text) when FHIR returns HTTP 400. A body that
is not an OperationOutcome is not printed. The transcript still does not
include keys or tokens.

## Still not a supported production backend

- No delete. An approved write persists on the shared sandbox.
- Not demo-eligible.
- Not a clinical, regulatory, or compliance claim.
