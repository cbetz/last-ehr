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
  **The probe below shows Medplum never sets this**, so the token must come
  from an authorization server that does. See "Two designs that survive the
  probe".
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

## Probe results (hosted Medplum, 2026-08-22)

The open questions below were probed against `api.medplum.com` with a
ClientApplication's client credentials. The results change the design, so they
are recorded before the plan.

| Question | Result |
| --- | --- |
| Token format | **JWT**, RS256, with `kid`. `jwks.json` serves 1 RS256 key |
| Claims | `aud`, `client_id`, `exp`, `iat`, `iss`, `jti`, `login_id`, `nbf`, `profile`, `scope`, `sub`, `username` |
| Audience | **Always `https://api.medplum.com/`** |
| `resource` parameter (RFC 8707) | **Accepted with HTTP 200 and silently ignored.** `aud` does not change |
| Token exchange (RFC 8693) | Advertised in metadata, but a plain ClientApplication gets `invalid_client`. It needs an identity provider configured on the project |
| Also advertised | `registration_endpoint` (RFC 7591), `introspection_endpoint` (RFC 7662) |

Two consequences.

**Medplum cannot be the authorization server for this resource server.** Every
token it issues has `aud = https://api.medplum.com/`. A resource server must
reject a token that is not addressed to it, so it must reject every Medplum
token. The design above assumed Medplum could mint a token addressed to a third
party. It cannot.

**The failure is silent, which makes it worse.** Medplum answers HTTP 200 to a
token request carrying `resource`, and returns a token whose audience is
unchanged. An implementation that trusts the absence of an error would conclude
that audience restriction works when it does not. That is the confused-deputy
case, reached by believing a success response.

Good news in the same results: tokens are JWTs against a published JWKS, so a
verifier validates them offline with `jose` and needs no network hop per
session.

## Two designs that survive the probe

### D1 — this server becomes its own authorization server

The MCP server issues its own tokens, so the audience is correct by
construction. It obtains a per-user Medplum token through the same
authorization-code flow with PKCE that the web app already runs
([`lib/smart.ts`](../lib/smart.ts)), and binds it to the session.

- Works with no extra operator infrastructure.
- Costs the most code here: token store, refresh, client registration, and the
  authorization and token endpoints. The SDK ships handlers for these.
- Contradicts a standing position. Last EHR delegates authentication and
  authorization rather than reimplementing them. An authorization server inside
  this package is the opposite of that.

### D2 — operator identity provider, plus Medplum token exchange

The operator runs an identity provider that does support RFC 8707, and registers
it on the Medplum project as an external identity provider.

1. The caller gets a token from that provider, addressed to this MCP server.
2. This server validates it offline against the provider's JWKS.
3. This server exchanges it at Medplum's token endpoint (RFC 8693) for a
   per-user Medplum token.

- Far less code here: a verifier and one exchange call. No authorization server.
- Keeps the delegation position intact.
- Preserves per-caller `AccessPolicy`, because step 3 returns that user's own
  Medplum token. Confirmed against the handler source below.
- **Holds no Medplum credential.** The exchange path checks no client secret,
  so this server stores nothing it could leak.
- Costs the operator an identity provider and one Medplum project setting. The
  probe shows the exchange grant refuses a client with no identity provider
  configured, so this setup is required, not optional.

**Recommended: D2**, because it keeps authorization decisions outside this
project. D1 stays possible later for operators with no identity provider, and
it would be an additive change rather than a replacement.

## Source evidence for D2 (medplum/medplum `main`, read 2026-08-23)

The live probe above cannot reach the exchange grant, because the project used
has no identity provider configured. Medplum is open source, so the handler
answers the remaining questions directly. Read from
`packages/server/src/oauth/token.ts` on `main`.

**The exchange issues an ordinary user token.** `exchangeExternalAuthToken`
ends with a normal login and the normal token response:

```
const login = await tryLogin({
  authMethod: 'exchange',
  email,
  externalId,
  projectId,
  clientId: client?.id,
  scope: req.body.scope || 'openid offline_access',
  ...
  forceUseFirstMembership: true,
  membershipId,
});

await sendTokenResponse(req, res, login, client);
```

So the exchanged token is bound to a `ProjectMembership` by the same code path
as any other login. Its `AccessPolicy` applies. That was the question the whole
design rested on, and the answer is yes.

**This server needs no Medplum credential at all.** The handler validates the
caller by calling the identity provider's user-info URL with the subject token.
It never checks a client secret on this path. The trust chain is caller →
identity provider → Medplum, and Last EHR holds nothing. That is a stronger
result than the design asked for: there is no shared credential to leak,
because there is no shared credential.

**One caveat, and it is a real one.** The call passes
`forceUseFirstMembership: true`. A user who belongs to more than one Medplum
project therefore gets whichever membership comes first, unless the request
pins one. The handler accepts a `membershipId`, so the fix is to always send it
rather than to rely on ordering. An implementation that omits it would work in
testing with single-project users and then select an arbitrary project for a
multi-project user. This must be sent explicitly, and it must be tested.

**Our `invalid_client` result is explained.** The observed
`{"error":"invalid_request","error_description":"Invalid client"}` is the path
taken when no identity provider resolves for the client. It confirms the
configuration requirement rather than a defect.

**Evidence limit.** This is the implementation on `main`. The hosted
`api.medplum.com` may run a different version, and a self-hosted operator
certainly may. So this narrows the live probe rather than replacing it: the
probe must still confirm the membership binding and the `AccessPolicy` effect
against the deployment in use.

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

Questions 1 and 2 are answered by the probe above. What remains:

1. **Which identity provider do we document for D2?** The operator needs one
   that supports RFC 8707 and that Medplum accepts as an external identity
   provider. This needs one worked example in the docs, not a list.
2. **Refresh.** A long-lived agent session outliving its Medplum token needs a
   defined behavior. Failing closed and making the client re-authorize is the
   safer default.
3. **Does the exchanged token carry the caller's `AccessPolicy`?** Answered yes
   at source level below. Still needs a live probe against the deployment in
   use, because the hosted version may differ from `main`.
4. **Membership pinning.** `forceUseFirstMembership: true` means a
   multi-project user gets an arbitrary project unless the request pins
   `membershipId`. Where does the MCP server learn which membership to pin?

## Sequence

1. This design note.
2. Probe Medplum for RFC 8707 audience support and token format. **Done, see
   above.** The result rules out Medplum as the authorization server.
3. Transport plus resource-server validation, off by default, with the
   per-session FHIR client.
4. The two write-path proving tests.
5. Threat-model boundary, support-matrix row, and MCP guide updates.
