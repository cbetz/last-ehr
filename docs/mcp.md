# MCP Server

`@lastehr/mcp` is the smallest installable Last EHR surface: an MCP server
that is read-only by default (search patients, open a chart), with one
opt-in write profile that carries the web app's proposal/approval semantics
onto MCP (below). It is deliberately separate from the web app.

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
and the write-policy boundary (read-only by default, the same opt-in write
profile) are identical to the Medplum mode.

This is distinct from `npm run mcp:demo` (the checkout-only Local Lab), which
remains fixture-restricted and needs no configuration at all.

## Registry metadata

The package is listed in the [Official MCP Registry](https://registry.modelcontextprotocol.io/?q=io.github.cbetz%2Flast-ehr), the client-facing installation record for the verified npm release.

Maintainers publish that immutable record through the manual `Publish MCP Registry metadata` GitHub Actions workflow after the corresponding npm version is public.

## Tool surface

By default the package exposes exactly two tools, both marked with MCP's
`readOnlyHint`:

- `search_patients`
- `show_patient_info`

The retired `0.1.x` line was permanently read-only, and read-only remains the
default forever. As of `0.2.0` there is exactly one opt-in beyond it, the
proposal-shaped write profile below.

## Proposal-shaped writes (0.2.0, opt-in)

`LASTEHR_MCP_WRITES=proposal` adds the web demo's write actions —
`add_note` (Communication), `record_observation` (Observation), and
`create_task` (Task) — as
**elicitation-gated proposals**: the tool builds the exact FHIR resource it
would create, presents those fields to the human through MCP elicitation
(client-rendered accept/decline/cancel with a single "Approve and save?"
boolean), and commits only on an explicit approval. A decline, cancel,
unapproved accept, or any approval-transport failure saves nothing and the
tool result says so. Every value the flag accepts other than `proposal` is
rejected loudly.

The profile is a binding of the repository's framework-neutral
[Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md) protocol
(v0.1 draft). The gate is structural, not advisory:

- **Capability-gated, fail closed.** The write tools are offered only to
  clients that declared the `elicitation` capability at initialization; a
  host that cannot render the approval never sees a write tool.
- **What you see is what saves.** The elicitation message contains the exact
  proposed fields; the committed resource is built from the same parsed
  input, with the same caps as the web demo's tools.
- **Tagged for audit.** Approved writes carry
  `meta.tag {https://lastehr.com/mcp | approved-proposal}` so operators can
  find every agent-written record with one `_tag` search, plus the standard
  **AIAST** security label ("Artificial Intelligence asserted") in
  `meta.security` per the HL7 AI Transparency on FHIR IG. Set
  `LASTEHR_WRITE_PROVENANCE=true` to also emit a `Provenance` resource per
  approved write naming the agent as author and the reviewer as verifier —
  see the [protocol's Audit section](./agent-write-protocol.md#4-audit).
- **Narrowable, never widenable.** `LASTEHR_WRITE_TOOLS_DISABLED`
  (comma-separated: `add_note`, `record_observation`, `create_task`)
  unregisters write tools entirely — unlisted and uncallable, with unknown names refusing
  startup. Embedders can pass a deny-only `policy` hook in
  `WriteToolOptions`: checked before the reviewer is asked, re-checked at
  commit, fail-closed, and its denials are attributed to configuration,
  never to a human (see the
  [protocol's Decision section](./agent-write-protocol.md#2-decision)).
- **Transport-adaptable.** The approval exchange lives behind one function
  (`createElicitationApproval`); the MCP 2026-07-28 release candidate
  replaces server-initiated elicitation with Multi Round-Trip Requests, and
  only that adapter changes when it lands.

The same data caveats as reads apply, doubled: only enable writes against a
project whose access policy you have scoped, and never against real data you
are not authorized to modify. The elicitation exchange requests a decision,
never data.

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

This builds `@lastehr/mcp` and starts it with your local Medplum environment
variables — including `LASTEHR_MCP_WRITES` if you have opted in.

## Roadmap

- Better read-tool coverage where it can stay bounded and auditable.
- Proposal-shaped writes shipped in `0.2.0` behind `LASTEHR_MCP_WRITES=proposal`
  (see above), riding MCP's reviewable confirmation protocol (elicitation).
  AIAST labeling and opt-in Provenance emission aligned with HL7's AI
  Transparency IG shipped with it (see "Tagged for audit" above).
