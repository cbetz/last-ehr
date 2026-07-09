# Changelog

This project is alpha. The changelog records adoption-relevant changes so
self-hosters can tell what moved between pulls.

## Unreleased

- Added public roadmap, governance, and adoption-focused docs.
- Added adapter contribution guidance and a backend adapter issue template.
- Added Docker packaging notes for repeatable local evaluation.

## 0.2 line

- Added HAPI FHIR support for fully local self-host evaluation.
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
