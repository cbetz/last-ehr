# Remote MCP (design, not yet implemented)

`@lastehr/mcp` speaks stdio only. A stdio server is one process on one
machine, started by one client, so no hosted agent can reach it. This page is
the design for a remote transport, written before the code so the parts that
are security decisions get reviewed as security decisions.

**Status: design. Nothing on this page ships yet.** The published package is
stdio-only today.

## The transport is the easy half

The MCP TypeScript SDK (1.29.0, already a dependency) ships
`WebStandardStreamableHTTPServerTransport`. It takes a web-standard `Request`
and returns a `Response`, so it needs no web framework:

```
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
});
const response = await transport.handleRequest(request);
```

Express, Hono, `jose`, and `cors` are all declared dependencies of the SDK
already, so a remote transport adds no new direct dependency to this package.

## The credential is the hard half

Today `loadMcpConfig` requires one FHIR credential before the process starts —
`MEDPLUM_ACCESS_TOKEN`, or `MEDPLUM_CLIENT_ID` plus `MEDPLUM_CLIENT_SECRET`
([`config.ts`](../packages/mcp/src/config.ts)). Over stdio that is right: one
operator, on their own machine, using their own credential.

Over HTTP, many callers reach one process. If that process holds one
credential, two things follow:

1. Every caller gets identical FHIR access.
2. This server, not the FHIR backend, decides who may see what.

The second one contradicts a stability promise in the
[roadmap](../ROADMAP.md): *backend access control belongs to the FHIR backend,
not this layer.* A remote server that shares one credential would move the
access-control decision into Last EHR, which is the one thing this project
says it does not do.

So the design rule is: **the FHIR credential is per caller, never per
process.**

### Three models, and why two are rejected

| Model | Mechanism | Verdict |
| --- | --- | --- |
| Shared credential, server-side authorization | Callers authenticate to this server; this server calls FHIR with its own credential | **Rejected.** Makes this server the access-control layer |
| Token passthrough | Caller sends a FHIR token; this server forwards it and validates nothing | **Rejected.** MCP authorization requires a server to reject tokens not issued for it. Accepting a token minted for another audience is the confused-deputy case the spec names |
| **Resource server** | Caller presents a token this server validates and accepts for itself; the per-caller identity in that token authorizes the FHIR calls | **Chosen** |

## The chosen shape

Last EHR MCP becomes an OAuth 2.1 **resource server**. It never becomes an
authorization server, and it never issues tokens.

- **Bearer validation.** `requireBearerAuth` from the SDK needs one seam: an
  `OAuthTokenVerifier` with a single `verifyAccessToken(token)` method
  returning `AuthInfo`. That is the whole integration point.
- **Audience.** `AuthInfo.resource` carries the RFC 8707 resource identifier.
  The verifier rejects any token whose resource is not this server's own
  identifier. This is what makes it a resource server rather than a relay.
- **Per-caller FHIR access.** `AuthInfo` reaches request handlers, so the
  session's FHIR client is built from the validated caller identity rather
  than from process env. A Medplum `AccessPolicy` therefore still decides what
  each caller can read and write, exactly as it does on the web path.
- **One server instance per MCP session.** `createReadTools(client)` and
  `createWriteTools(client, approval, options)` already take their client as an
  argument, so per-session construction needs no refactor of the tool layer.
- **Metadata.** The server serves `/.well-known/oauth-protected-resource` so a
  client can discover which authorization server to use. That is one small JSON
  document, which is why the express-based authorization-server router in the
  SDK is not needed.
- **Discovery reuse.** The web app already discovers a FHIR server's OAuth
  endpoints rather than hardcoding them
  ([`lib/smart.ts`](../lib/smart.ts), `fetchSmartConfiguration`). The verifier
  uses the same discovery, so a self-hosted Medplum works without extra
  configuration.

## Writes need no protocol change

An earlier note in this project's discussion said a remote approval path would
change the write protocol. That was wrong, and the correction matters:

- Elicitation is a server-to-client request. Streamable HTTP carries
  server-to-client messages on its stream, so elicitation is available over
  HTTP.
- The capability gate already fails closed. `clientSupportsApproval(server)`
  decides per request whether write tools are offered at all, so a client that
  cannot render an approval prompt is offered no write tool — over any
  transport.

So [Approval-Gated Agent Writes on FHIR](./agent-write-protocol.md) is
unchanged by a remote transport. What is required is **evidence**: an
integration test that drives an approval over HTTP end to end, and a second
that proves a client without elicitation support receives no write tools. A
transport change to a human-approval path is exactly the kind of claim this
project tests rather than asserts.

## What this design does not do

Stated plainly, because a remote server invites each of these assumptions:

- It does not make Last EHR a multi-tenant service. Each caller's reach is
  whatever their own FHIR identity allows, and nothing here aggregates tenants.
- It does not make any backend PHI-ready. The support matrix
  ([docs/support.md](./support.md)) is unchanged by transport.
- It does not add an authorization server. Operators bring their own.
- It does not relax the write default. Read-only stays the default, and
  `LASTEHR_MCP_WRITES=proposal` stays an explicit opt-in.
- It does not make the local HAPI stack safe to expose. That server has no
  auth; a remote transport in front of it would publish an unauthenticated
  chart API.

## Open questions

1. **Which authorization server issues tokens for a Medplum deployment?**
   Medplum exposes OAuth2 endpoints and the web app already runs an
   authorization-code flow with PKCE against them. Whether Medplum can mint a
   token whose audience is a *third-party* resource server, per RFC 8707, needs
   a probe against a live project before the verifier design is fixed. If it
   cannot, operators need a separate authorization server, and that belongs in
   the docs before the feature ships.
2. **How does the verifier learn scopes and identity?** If Medplum tokens are
   JWTs, `jose` (already present) validates them offline against the server's
   JWKS. If they are opaque, the verifier needs an introspection or userinfo
   call per session, which is a network hop to budget for.
3. **Refresh.** A long-lived agent session outliving its access token needs a
   defined behavior. Failing closed and making the client re-authorize is the
   safer default.

## Sequence

1. This design note.
2. Probe Medplum for RFC 8707 audience support and token format. Record the
   result here, because it decides question 1.
3. Transport plus resource-server validation, off by default, with the
   per-session FHIR client.
4. The two write-path proving tests.
5. Threat-model boundary, support-matrix row, and MCP guide updates.
