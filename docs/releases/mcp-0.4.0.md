# Last EHR MCP 0.4.0: remote transport and installation checks

**Published October 22, 2026.** npm `latest` and the Official MCP Registry were verified at `0.4.0`. The [GitHub release](https://github.com/cbetz/last-ehr/releases/tag/mcp-v0.4.0) targets tested source [`f36d05dde21c6e1c6847f2660a966afd2615c646`](https://github.com/cbetz/last-ehr/tree/f36d05dde21c6e1c6847f2660a966afd2615c646).

`@lastehr/mcp` adds an optional HTTP transport and better installation
diagnostics. Stdio and read-only behavior remain the defaults.

## Optional HTTP transport

`LASTEHR_MCP_TRANSPORT=http` runs an OAuth resource server with one MCP server
per session. It verifies a token addressed to this server and exchanges it
for the caller's own Medplum credential. It needs no shared FHIR credential;
each session holds its exchanged token. The caller's backend access policy
still controls access, and sessions cannot be reused by another principal.

HTTP mode requires operator-provided OAuth infrastructure and TLS for
network-facing use. The local no-auth HAPI mode is refused over HTTP.

The complete run with a real identity provider and Medplum remains
unverified. Existing evidence covers SDK loopback behavior and token exchange
against a disposable Medplum server with a mock identity provider. See the
[operator guide](https://www.lastehr.com/docs/mcp#remote-transport-http-opt-in)
and [verification boundary](https://www.lastehr.com/docs/remote-mcp#what-has-been-verified).

## Installation and diagnostics

- `doctor` remains an offline configuration check.
- `doctor --connect` checks R4 metadata and a count-only Patient search for
  the stdio backend. It has bounded requests, refuses redirects, makes no
  chart write, and prints no patient data or counts.
- HTTP diagnostics explicitly leave caller OAuth and client approval support
  unverified. A configured endpoint is not reported as a working login.
- `init --client cursor` declares Cursor's stdio transport.
- Release verification installs the packed tarball outside the checkout and
  checks CLI execution, client configuration, HTTP exports, MCP reads, and
  capability-gated proposals.

## Install the verified release

```bash
npx -y @lastehr/mcp@0.4.0 --version
claude mcp add lastehr -- npx -y @lastehr/mcp@0.4.0
```

Configure least-privilege Medplum credentials before starting the stdio
server. The repository's HAPI option is for local synthetic evaluation. The
`init` command prints a template with an unversioned package argument; change
that argument to `@lastehr/mcp@0.4.0` to keep a generated client configuration
pinned to this release.

The package offers four shared chart-read tools. Optional proposal tools
create notes, Observations and linked corrections, and Tasks after explicit
human approval in a compatible client. Approval controls writes; it does not
control chart context sent by the MCP client to its model provider.

## Release verification

[CI run 39856748538](https://github.com/cbetz/last-ehr/actions/runs/39856748538)
passed on the exact source above using Ubuntu 24.04 and Node 22.18.0: 574 unit
tests passed (4 skipped), 12 browser tests passed, and the local HAPI checks,
synthetic workflow evaluation, and strict write-protocol conformance passed.
The run retains `fhir-agent-safety-eval` and `awp-conformance` artifacts.

After publication, the downloaded npm `0.4.0` artifact matched the tested
tarball's SHA-512 integrity and passed the isolated-install checks again:
CLI version, client configuration, HTTP exports, read-only diagnostics,
synthetic MCP read, and approval capability gate. These checks do not prove
real client approval behavior or the unverified real identity-provider HTTP
deployment described above.

The Official MCP Registry's [exact 0.4.0 record](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.cbetz%2Flast-ehr/versions/0.4.0)
and [latest record](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.cbetz%2Flast-ehr/versions/latest)
were verified active and pointing to npm `@lastehr/mcp@0.4.0` over stdio after
[registry publication](https://github.com/cbetz/last-ehr/actions/runs/39860012837).
See the [setup guide](https://www.lastehr.com/docs/mcp),
[source](https://github.com/cbetz/last-ehr/tree/f36d05dde21c6e1c6847f2660a966afd2615c646/packages/mcp), and
[release process](https://github.com/cbetz/last-ehr/blob/main/docs/releasing-mcp.md).
