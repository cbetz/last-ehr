# MCP Server

`@lastehr/mcp` is the smallest installable Last EHR surface: a
read-only MCP server for searching patients and opening a chart. It is
deliberately separate from the web app, where writes are proposal-shaped and
approval-gated.

## Zero-credential Local Lab (checkout only)

Want to inspect the MCP interaction before creating a Medplum project or
configuring a model-provider API key? The repository includes a separate
synthetic HAPI Local Lab. It is intentionally **not** part of `@lastehr/mcp`
and does not broaden that package's support boundary.

From a local checkout with Node 22.18+ and Docker running:

```bash
npm install
npm run mcp:demo -- --client claude-code
```

The command starts the repository's local HAPI + Postgres stack, waits for it,
recreates the four synthetic fixture charts, then prints a ready-to-paste
Claude Code registration command. For a JSON configuration (including Cursor),
use either the default or `--client cursor`:

```bash
npm run mcp:demo
npm run mcp:demo -- --client cursor
```

The generated client process invokes the checkout directly, rather than an npm
lifecycle command, so its stdout is reserved for MCP JSON-RPC. The lab server
does not require or read FHIR/Medplum credentials or a model-provider API key.
Your MCP client still needs its usual authenticated model account and may send
the returned **synthetic** chart data to that provider. Docker may also pull
the local images on the first run.

Its boundary is deliberately narrow:

- exactly `search_patients` and `show_patient_info`, both with `readOnlyHint`;
- only the four records carrying this repository's synthetic fixture
  identifiers are discoverable;
- the generated configuration targets `127.0.0.1:8080/fhir`, and the server
  accepts only loopback HAPI endpoints;
- no write tool, write flag, credential configuration, or arbitrary FHIR
  endpoint exists.

The local HAPI container has no authentication. Use this lab only for synthetic
data on one machine. Compose binds it to `127.0.0.1` by default; do not change
that to a network-facing port. It is an evaluation experience, not generic HAPI
support, an authorization layer, a PHI workflow, or a release of
`@lastehr/mcp`.

Run `npm run mcp:demo -- --prepare` when you only want to pre-warm the local
stack. The `--serve` mode is reserved for the generated MCP configuration and
must not be launched through `npm run`, because npm may write non-protocol text
to stdout. Keep the local stack running while the client is connected; use
`npm run demo:local:down` to remove it when finished. Port 8080 must be free.

## Install and connect

```bash
npx -y @lastehr/mcp init
```

The command prints a portable MCP configuration. Add a least-privilege token,
then place the result in your MCP client's configuration:

```json
{
  "mcpServers": {
    "lastehr": {
      "command": "npx",
      "args": ["-y", "@lastehr/mcp"],
      "env": {
        "MEDPLUM_ACCESS_TOKEN": "<replace-with-a-least-privilege-token>"
      }
    }
  }
}
```

For Claude Code, print the registration command instead:

```bash
npx -y @lastehr/mcp init --client claude-code
```

The process inherits `MEDPLUM_*` variables from your shell or MCP client
configuration. Start it directly with `npx -y @lastehr/mcp` when you want to
test a stdio connection yourself.

## Auth

The package uses Medplum credentials:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
```

or:

```bash
MEDPLUM_ACCESS_TOKEN=...
```

Set `MEDPLUM_BASE_URL` for self-hosted Medplum.

## Local stack (`FHIR_BACKEND=hapi`)

The published package also honors the same env pair the web app and seed use,
so a fully local synthetic stack gets MCP too:

```bash
FHIR_BACKEND=hapi
FHIR_BASE_URL=http://localhost:8080/fhir   # or HAPI_BASE_URL
```

No credentials: the repository's HAPI evaluation stack is no-auth by design,
which is exactly why the same caveats apply as in the web app — local,
single-tenant, synthetic data only; never point it at an exposed server or
treat it as an authorization layer. Any configured `MEDPLUM_*` values are
unused in this mode (a checkout's `.env` commonly carries both). The tools
and the read-only boundary are identical to the Medplum mode.

This is distinct from `npm run mcp:demo` (the checkout-only Local Lab), which
remains fixture-restricted and needs no configuration at all.

## Registry metadata

The package is listed in the [Official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.cbetz%2Flast-ehr), the client-facing installation record for the verified npm release.

Maintainers publish that immutable record through the manual `Publish MCP Registry metadata` GitHub Actions workflow after the corresponding npm version is public.

## Tool surface

The published `0.1.x` package exposes exactly two tools, both marked with MCP's
`readOnlyHint`:

- `search_patients`
- `show_patient_info`

There is no environment switch that exposes write tools. A write-capable MCP
surface would need a proposal protocol and a separate safety review before it
is considered for a future release.

## Data and support boundary

Read-only does not mean low-risk: `show_patient_info` can return PHI-rich
chart data. Use the smallest Medplum AccessPolicy that meets the task, confirm
that your MCP client and model provider are appropriate for the data, and do
not treat this package as an authorization layer.

`@lastehr/mcp` supports hosted or self-hosted **Medplum** authentication, plus
the repository's local no-auth HAPI stack (`FHIR_BACKEND=hapi`, local synthetic
data only). It does not claim generic FHIR, SMART launch, or browser-approval
parity. See the [support matrix](./support.md) for the complete boundary.

## From a checkout

The repository includes the same **Medplum** package for contributors:

```bash
npm run mcp
```

This builds `@lastehr/mcp` and starts the two read-only tools using your local
Medplum environment variables.

## Roadmap

- Better read-tool coverage where it can stay bounded and auditable.
- Proposal-shaped writes only if MCP clients support a reviewable confirmation
  protocol.
