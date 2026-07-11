# Changelog

This project is alpha. The changelog records adoption-relevant changes so
self-hosters can tell what moved between pulls.

## Unreleased

- Added `npm run mcp:demo`, a checkout-only synthetic HAPI MCP Local Lab that
  prepares fixture data and prints a no-FHIR-credential Claude Code/Cursor
  configuration for the two bounded read tools.
- Added a fixture-restricted local read facade and a real stdio HAPI smoke test
  so the lab cannot discover arbitrary records on a reused local HAPI volume.
- Bound the unauthenticated local HAPI Docker port to loopback by default.
- Kept `@lastehr/mcp` Medplum-only; the Local Lab is not published package or
  generic HAPI support.

## 0.2.1 — 2026-07-11

- Added `@lastehr/mcp`, a standalone, Medplum-only MCP package with two
  read-only chart tools and a guided client configuration command.
- Added Official MCP Registry metadata for the published npm package.
- Added a GitHub OIDC workflow to publish immutable MCP Registry records
  without storing a registry secret.
- Added a concise MCP activation path and synthetic-data walkthrough to the
  README.
- Removed direct-write MCP exposure; the published `0.1.x` package contains no
  write tools or write-enable environment switch.
- Raised the Node.js runtime baseline to 22.18 (or 24.2+) to match
  `@medplum/core` and avoid Node 20's missing global `WebSocket`.

## 0.2.0 — 2026-07-09

- Added public roadmap, governance, and adoption-focused docs.
- Added adapter contribution guidance and a backend adapter issue template.
- Added a reusable FHIR REST transport, adapter starter, and layered contract
  harnesses; HAPI now proves the real-server contract in CI.
- Pinned React and React DOM to the 19.2.6 security baseline.
- Added Docker packaging notes for repeatable local evaluation.
- Added an explicit support matrix and a CI smoke test for the local HAPI
  onboarding path.
- Added an explicit zero-key scripted local HAPI walkthrough: no external model
  request, one synthetic record, and one approval-gated fixed observation.
- Added `npm run demo:local` for the repeatable zero-key path, plus a live
  HAPI CI smoke test that verifies the approval-gated scripted write.
- Clarified the local HAPI boundary: synthetic, single-tenant evaluation—not an
  offline general agent or authenticated deployment path.
- Removed chart-adjacent upstream error text from browser responses and
  analytics events.
- Added HAPI FHIR support for local synthetic evaluation.
- Added a Docker Compose HAPI FHIR + Postgres stack.
- Added the `FhirBackend` interface as the adapter seam.
- Added model provider policy: BAA-capable providers only.
- Added Amazon Bedrock support for BAA-capable multi-model deployments.
- Added optional demo model picker with server-side allowlist.

## 0.1 line

- Initial Next.js chat app over Medplum.
- Added four FHIR tools: search patients, show chart, add note, record
  observation.
- Added approval-gated writes in the web UI.
- Added synthetic seed patients.
- Added read-only-by-default MCP server.
