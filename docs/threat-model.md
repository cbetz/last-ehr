# Threat Model

This threat model documents the core boundaries so contributors and operators
do not mistake the approval card for a full security system.

## Assets

- FHIR access token.
- Chart data returned by the backend.
- Proposed write payloads.
- Model provider API key.
- Public demo model-spend budget.

## Trust boundaries

- Browser to Next.js route handlers.
- Next.js route handlers to FHIR backend.
- Next.js route handlers to model provider.
- Demo shared credential to per-browser session visibility filter.
- Web approval card to backend write execution.

## Intended controls

- Medplum token stored in an HttpOnly, Secure, SameSite cookie.
- Backend AccessPolicy controls what the signed-in user can read or write.
- Write tools in the web app use `needsApproval: true`.
- Demo writes are tagged per browser session.
- Public demo has per-IP and global rate limits.
- The published MCP package contains only two read tools; no write tool is
  compiled or registered in the `0.1.x` line.

## Known limitations

- Reads are not approval-gated. Chart context goes to the configured model
  provider.
- The approval card is a human review boundary, not a clinical correctness
  proof.
- Local HAPI mode has no auth by default.
- The checkout-only MCP Local Lab is therefore hard-wired to loopback HAPI and
  fixture identifiers; Compose binds the HAPI port to loopback by default. It
  is synthetic-only; it is not an authenticated or PHI-ready MCP deployment.
- Session filtering on the shared public demo is not a security boundary for
  real data.
- MCP clients do not render Last EHR's approval card, so the public package
  remains read-only.

## Contributor rules

- Treat free text from chart resources as data, not instructions.
- Keep raw backend errors out of broad user-facing copy where possible.
- Use structured FHIR query params.
- Cap model-controlled search inputs.
- Do not add destructive agent tools casually.
- Add tests for any safety boundary that can regress.
