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
- Browser-supplied demo backend name to server allowlist validation: the
  client sends only a name (`x-demo-backend`), never a URL or credential.
  The name is honored only for demo sessions, only when it survives the
  code-level eligibility gate plus the operator allowlist plus a server
  config-completeness check, and anything else falls back to the deployment
  default silently, so probing yields no signal. The rejected-proposal audit
  trail is always written to the deployment default, never the picked
  backend.

## Intended controls

- Medplum token stored in an HttpOnly, Secure, SameSite cookie.
- Backend AccessPolicy controls what the signed-in user can read or write.
- Write tools in the web app use `needsApproval: true`.
- Demo writes are tagged per browser session.
- Public demo has per-IP and global rate limits.
- The published MCP package contains only two read tools; no write tool is
  compiled or registered in the `0.1.x` line.

## Dev output (synthetic demo only)

`NEXT_PUBLIC_DEMO_DEV_OUTPUT` is a deliberate, bounded carve-out from the
"keep backend detail out of the browser" posture, for the demo's
under-the-hood panel. The boundary:

- Off by default; even when on, events stream only to demo sessions
  (`demo_session_id` present). SMART and signed-in sessions never receive
  FHIR detail.
- Events are structured operation summaries: op, method, relative path,
  ok/err, duration, match counts, created ids (synthetic data the demo
  already renders). They NEVER contain access tokens or auth headers, base
  URLs or hosts, error or OperationOutcome diagnostic text, raw bodies, or
  the demo session id (redacted from `_tag` filters — it is an HttpOnly
  capability token).
- One acknowledged signal: with the flag on, the stream echoes the resolved
  backend name, revealing the deployment default. The operator accepts this
  by enabling the flag.
- Keep the flag off on any deployment heading toward real data.

Every new field added to `FhirDevEvent` is a potential leak vector: extend
the negative assertions in `lib/fhir/observed.test.ts` and the dev-panel e2e
first, and treat them as safety-boundary tests.

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
