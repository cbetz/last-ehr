# Supported configurations

Last EHR is an alpha reference implementation for approval-gated FHIR agent
workflows. This page states exactly what works today so evaluators can choose a
safe path and contributors know where an adapter is needed.

| Configuration | Web app | SMART launch | MCP | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Medplum, hosted or self-hosted | Yes | Yes | Read-only | Supported | The authenticated path. `@lastehr/mcp` exposes two chart-reading tools; Medplum owns identity, tenancy, AccessPolicy, and audit logs. |
| HAPI FHIR from this repository's Docker Compose stack | Yes | No | Synthetic lab only | Local evaluation only | The included HAPI server has no auth and Compose binds it to loopback by default. Use synthetic data on one machine; do not expose it or treat browser-session filtering as access control. `npm run mcp:demo` offers two fixture-restricted, read-only MCP tools from a checkout; it is not `@lastehr/mcp` HAPI support. It also includes an optional zero-key scripted walkthrough, restricted to one seeded record and one fixed observation. |
| Another no-auth, standard FHIR R4 server | Evaluation only | No | No | Unverified | It may work through the HAPI REST transport, but is not supported until both contract harnesses and the four synthetic workflows pass. |
| FHIR R4 server with authentication or product-specific behavior | Not yet verified | Not yet verified | Not yet verified | Adapter wanted | Start from the adapter starter, then implement and verify the auth story and `FhirBackend` contract before calling it supported. |

## Model providers

The web app supports OpenAI, Anthropic, and Amazon Bedrock for real agent
flows. The local HAPI stack also has one deliberately limited exception:

| Mode | Credential | Scope |
| --- | --- | --- |
| `AI_PROVIDER=scripted` | None | Explicit local HAPI-only walkthrough: search the seeded Maria Garcia record, propose `Heart rate: 72 bpm`, and wait for approval. No external model request; no arbitrary chart reads or writes. |
| OpenAI, Anthropic, or Amazon Bedrock | Tool-capable provider credential | Full four-tool agent flow. Follow the provider's BAA and data-handling requirements before any real-data use. |

The scripted path is not a bundled model and does not make the HAPI stack
suitable for real PHI. It is a reproducible way to inspect the approval-loop
mechanics before configuring a provider.

## What "supported" means

A supported configuration has a documented setup path and is expected to work
through the four synthetic-data tools:

1. Search patients.
2. Show a chart.
3. Propose and approve a note.
4. Propose and approve an observation.

For Medplum, that includes authentication and backend-enforced access control.
For local HAPI, it means a single-tenant synthetic demonstration only. The
scripted zero-key option intentionally covers only its fixed search and
approval-gated observation—not the full general-agent surface.

## Adding a backend

The extension point is deliberately small. Follow the [adapter guide](./adapters.md)
to implement the `FhirBackend` contract, add contract-style tests, document the
authentication and tenancy model, and verify all four workflows with synthetic
data. Open a [backend adapter issue](https://github.com/cbetz/last-ehr/issues/new?template=backend_adapter.yml)
before a large implementation so the verification target is clear.

Do not add backend-specific branches to the agent tools or emulate backend
authorization in Last EHR. The backend remains the system of record and the
security boundary.
