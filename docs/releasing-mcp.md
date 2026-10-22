# Releasing the MCP package

The repository version, npm package, MCP Registry record, and GitHub release
are separate artifacts. A merged version change does not publish a package.
The October 22, 2026 check found the repository at `0.4.0` and npm `latest`
still at `0.3.1`. Check the registry again when releasing.

## Verify the package people will install

From the checkout:

```bash
npm ci
npm run mcp:pack:check
```

This builds and packs `@lastehr/mcp`, then installs the tarball into a temporary
directory outside the repository. It checks the installed executable and
version, setup output, HTTP transport exports, a read-only connection probe,
a synthetic MCP read, and the approval capability gate. It makes no FHIR
write. The temporary installation is removed after the checks.

The candidate and its SHA-512 integrity are retained under
`artifacts/mcp-release/`, which is ignored by Git:

- `lastehr-mcp-0.4.0.tgz`
- `verified.json`

The version in the filenames follows `packages/mcp/package.json`; it must
match `packages/mcp/server.json` and the MCP runtime version. CI runs this
check on every pull request and main push. The normal HAPI, browser, safety,
and conformance checks remain separate release evidence.

## Configure npm trusted publishing

The manual workflow is `.github/workflows/publish-mcp.yml`. Configure a
GitHub Actions trusted publisher for `@lastehr/mcp` in its npm package settings:

| npm field | Value |
| --- | --- |
| Organization or user | `cbetz` |
| Repository | `last-ehr` |
| Workflow filename | `publish-mcp.yml` |
| Environment | Leave blank |
| Allowed action | Allow direct `npm publish` |

This uses GitHub OIDC rather than a stored npm token. The package owner must
configure the trust relationship in npm. Configure it when ready to publish:
npm requires the first successful use within two days. Follow the
[npm trusted-publisher instructions](https://docs.npmjs.com/trusted-publishers/)
if the settings change. Never paste credentials or one-time codes into issues,
PRs, logs, or this document.

## Verify, then publish

The workflow runs only from `main` in `cbetz/last-ehr`. Its version input must
match both manifests. First run it without publishing:

```bash
gh workflow run publish-mcp.yml --ref main -f version=0.4.0 -f publish=false
```

Inspect the workflow summary and uploaded candidate. Before actual
publication, wait for all of the `CI` workflow on that exact main commit to
pass. Then:

```bash
gh workflow run publish-mcp.yml --ref main -f version=0.4.0 -f publish=true
```

The workflow enforces successful CI for its exact main SHA, builds and checks
the tarball, preserves the candidate, and publishes that same file. It then
downloads the named npm version, compares integrity with the candidate,
checks that `latest` selects it, and repeats the isolated-install checks.
Public verification allows up to ten minutes for npm processing and propagation.
The publication fails visibly if npm trust is missing; a verified local
tarball is not a successful release.

If npm publication succeeded but post-publication verification failed, inspect
the run and public npm metadata before doing anything else. npm may accept a
package and report that it is still processing before the version becomes
public. A successful publish step does not establish public availability.
Package versions are immutable; do not rerun publishing to resolve a processing
delay. Once the exact version is public, use the preserved integrity to rerun
verification:

```bash
node scripts/check-mcp-package.mjs --published
```

For comparison with an earlier candidate, set `LASTEHR_RELEASE_INTEGRITY` to
its recorded SHA-512 value when running the command. Integrity is public
artifact metadata, not a credential.

## Complete discovery records

After the exact npm artifact passes verification:

1. Run `Publish MCP Registry metadata` from the same tested main revision.
   Its publisher verifies the immutable npm version named in `server.json`.
2. Publish the GitHub release using `docs/releases/mcp-0.4.0.md` as notes.
   Use an MCP-specific tag such as `mcp-v0.4.0`; an app `v*` tag also triggers
   the separate GHCR app-image workflow.
3. Check `npm view @lastehr/mcp dist-tags --json`, the public MCP Registry
   record, the GitHub tag's commit, and the install guide.
4. Fill the tested revision and published version in the
   [outreach kit](./outreach/2026-10-launch-kit.md) before inviting evaluators.

The [October 22, 2026 checkout harness report](./evidence/remote-mcp-2026-10-22.json)
records 18 passing checks on clean source `e970461`: real Keycloak login,
local self-hosted Medplum, public HTTPS UserInfo, and scripted SDK decisions.
Keep this checkout evidence separate from the published artifact's source and
integrity checks in release notes. Hosted Medplum, deployed public MCP TLS,
a real host's human approval UI, and actual reviewer identity still need
separate verification.
