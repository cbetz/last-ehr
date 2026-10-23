# Last EHR MCP 0.4.1: version-pinned client setup

Repository version, npm publication, public artifact verification, and the
Official MCP Registry record are separate. A merged version change is not a
published release. See the [GitHub release](https://github.com/cbetz/last-ehr/releases/tag/mcp-v0.4.1)
for publication evidence and the exact released source.

`init` now pins every generated client command to the version of the package
running it. JSON, Cursor and Claude Code output from `@lastehr/mcp@0.4.1`
therefore starts `@lastehr/mcp@0.4.1`, rather than following npm's future
`latest` tag. Evaluators no longer need to edit that package argument by hand.

To print the setup command from this exact version once it is available on npm:

```bash
npx -y @lastehr/mcp@0.4.1 init --client claude-code
# Registration command printed by init:
claude mcp add lastehr -- npx -y @lastehr/mcp@0.4.1
```

The command still prints setup instructions; it does not register the server
or supply credentials automatically. JSON retains the least-privilege token
placeholder, Cursor retains its explicit stdio transport, and read-only
remains the default. This patch changes no chart tools, approval behavior,
authentication, FHIR permissions or remote transport behavior. `doctor` is
still a configuration check; `doctor --connect` still checks only bounded
stdio FHIR metadata and a count-only Patient search.

## Verification and remaining limits

The artifact must pass the [release process](../releasing-mcp.md), including
installation of its exact tarball outside the checkout. The generated
commands must name the same version reported by that installed executable.
Public npm availability, matching artifact integrity and the Registry record
must be checked after publication before calling this release verified.

The existing [October 22 remote MCP report](../evidence/remote-mcp-2026-10-22.json)
records 18 passing checks on clean source `e970461`, using real Keycloak
authorization-code/PKCE login, local self-hosted Medplum and public HTTPS
UserInfo. MCP and IdP login/token traffic in that fixture use loopback HTTP;
approval decisions are scripted MCP SDK responses. Keycloak's native
resource-indicators feature is experimental. Hosted Medplum, deployed public
MCP TLS, a real MCP host's human approval interface and actual reviewer
identity remain unverified. This setup patch does not extend that evidence.

The synthetic browser recording inputs remain pinned to source
`f36d05dde21c6e1c6847f2660a966afd2615c646` and MCP `0.4.0`; this onboarding
patch does not relabel that recording's source or package version.
