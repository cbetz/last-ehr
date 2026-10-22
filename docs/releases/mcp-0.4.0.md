# Last EHR MCP 0.4.0: remote transport and installation checks

**Draft release notes. Publish after npm and MCP Registry verification.**

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

After publication:

```bash
npx -y @lastehr/mcp@0.4.0 --version
npx -y @lastehr/mcp@0.4.0 init --client claude-code
```

Configure least-privilege Medplum credentials before starting the stdio
server. The repository's HAPI option is for local synthetic evaluation.

The package offers four shared chart-read tools. Optional proposal tools
create notes, Observations and linked corrections, and Tasks after explicit
human approval in a compatible client. Approval controls writes; it does not
control chart context sent by the MCP client to its model provider.

See the [setup guide](https://www.lastehr.com/docs/mcp),
[source](https://github.com/cbetz/last-ehr/tree/main/packages/mcp), and
[release process](https://github.com/cbetz/last-ehr/blob/main/docs/releasing-mcp.md).
