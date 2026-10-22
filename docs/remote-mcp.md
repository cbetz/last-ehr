# Remote FHIR MCP: HTTP and OAuth

Remote FHIR MCP lets a client reach Last EHR's chart tools over streamable
HTTP instead of starting a local stdio process. `@lastehr/mcp` added this
opt-in transport in 0.4.0 with `LASTEHR_MCP_TRANSPORT=http`. It supports Medplum
with per-caller OAuth; the local no-auth HAPI stack is refused. Stdio remains
the default.

This page describes the `0.4.0` repository code. The checkout can be ahead of
npm publication; follow the [installation and version check](./mcp.md#install-and-connect)
before configuring these transport options.

## How does remote OAuth work?

The caller obtains a token from an operator-provided identity provider,
addressed to this MCP server. Last EHR validates that token and exchanges it
at Medplum for the caller's own FHIR credential. Medplum's `AccessPolicy`
continues to control that caller's reads and writes. The server requires no
shared Medplum access token or client secret, but holds each exchanged
credential for its session.

Read-only remains the default. Opt-in writes use the same human approval
protocol as stdio and require a client that declares MCP elicitation support.
Chart results return to the MCP client, which may send them to its model
provider. The write approval prompt does not control that data flow. See the
[MCP guide](./mcp.md) for tool coverage and client setup.

## What has been verified?

**The real identity-provider evaluation passed all 18 checks on 2026-10-22.**
The [scrubbed report](./evidence/remote-mcp-2026-10-22.json) records completion
at `2026-10-22T22:39:10.406Z` on a clean checkout of
`e970461a0de6786ac8954966ce0bcc8a40731b69`. It verifies real Keycloak login,
Medplum token exchange and per-caller permissions, and HTTP MCP reads and
scripted approval decisions in the disposable local fixture.

An earlier disposable Medplum 5.1.35 probe verified token exchange and
`AccessPolicy` enforcement with a mock identity provider. That probe used an
unsafe-outbound override to reach the local mock; it does not verify the
public-HTTPS identity-provider setup required for deployment.

The [reproducible evaluation below](#run-the-real-identity-provider-evaluation)
passed with an actual Keycloak login and a public-HTTPS UserInfo bridge without
the unsafe-outbound override. Login and MCP transport remain on loopback;
hosted Medplum, deployed public MCP TLS, real-host approval UI and reviewer
identity need separate verification.

Configuration and operator requirements are in
[What shipped](#what-shipped-040) and the
[operator guide](./mcp.md#remote-transport-http-opt-in). The sections below
retain the design decisions, dated probe evidence, implementation corrections,
and remaining verification work.

## Run the real identity-provider evaluation

**Status: all 18 checks passed on 2026-10-22; [report](./evidence/remote-mcp-2026-10-22.json).**
This is a repository evaluation command, separate from the published MCP
package. It creates its own disposable Docker Compose project, synthetic users and chart,
and temporary public HTTPS endpoint. No hosted Medplum account, external IdP
account, Cloudflare account, model key, or existing `.env` credentials are needed.

Prerequisites:

- A supported Node version and dependencies installed with `npm ci`.
- A running Docker engine with Docker Compose.
- `cloudflared` installed and on `PATH`.
- Playwright Chromium installed with `npx playwright install chromium` and
  its browser system dependencies available.
- Internet access for image pulls and the temporary Cloudflare tunnel.

From the checkout:

```bash
npm ci
npx playwright install chromium
npm run mcp:remote:verify -- --confirm-synthetic
```

The confirmation authorizes creation of this disposable synthetic fixture
and its public UserInfo endpoint. The harness does not reuse the regular
HAPI demo stack or a hosted project. It generates its own credentials in a
private temporary directory and passes an explicit configuration to MCP;
the bootstrap administrator's token is used only for fixture setup and
independent FHIR verification.

The application images are pinned by digest: Keycloak `26.8.1` and Medplum
`5.1.35`. Keycloak's native RFC 8707 `resource-indicators` feature is enabled;
Keycloak documents that feature as [experimental](https://www.keycloak.org/securing-apps/mcp-authz-server).
Medplum runs with
`allowUnsafeOutbound: false`. Its outbound HTTPS and public-address checks
remain active.

Cloudflared starts an anonymous Quick Tunnel with a generated
`https://<random>.trycloudflare.com` address. It receives an explicit empty
configuration and an empty `HOME` in its own private temporary directory,
excluding existing user and system tunnel settings. No Cloudflare login,
named-tunnel credentials, custom domain or DNS setup is needed, and the
harness does not change existing domains or DNS records.

Only an allowlisted GET route to Keycloak's real, bearer-protected UserInfo
endpoint crosses the public HTTPS tunnel. Keycloak's login, token, JWKS and
administration endpoints, Medplum, and MCP remain on loopback; Postgres and
Redis have no published host ports. The bridge forwards the presented bearer
to Keycloak and returns its actual UserInfo response. It does not invent an
identity or accept a bearer without provider validation.

The evaluation checks these boundaries:

| Boundary | Exercise |
| --- | --- |
| Real IdP login | Two synthetic users sign in through Keycloak in Chromium using authorization code and S256 PKCE. Tokens are checked against JWKS and the MCP resource audience; an unregistered resource must be refused. |
| Medplum exchange and permissions | The real RFC 8693 endpoint resolves both subjects into distinct project memberships. A writer can read the seeded Observation; the Patient-only reader cannot. |
| HTTP MCP and proposed writes | The production server and real MCP SDK client perform chart reads, wait for an elicitation decision, and verify the approved note's stored fields and AI labels independently in Medplum. |
| Refusal paths | Decline, cancellation, unchecked approval, missing elicitation capability, restricted backend permissions, another caller's session, a differently audienced ID token, and an expired provider token must fail without an additional stored note. |

The MCP client's decisions are scripted SDK responses. Chromium automates the
IdP's login form; it does not inspect a real MCP host's human approval UI.
MCP, IdP login and token requests use loopback HTTP in this fixture. The dated
pass establishes the described local pipeline with a real IdP and public
HTTPS UserInfo, while leaving hosted Medplum, deployed public MCP TLS, actual
reviewer identity and the approval interface of a particular host unverified.
Live write coverage is `add_note` (`Communication`), with resource-type
permissions in one project.

The command writes a scrubbed report to
`artifacts/remote-mcp/verification.json`. It includes source revision and dirty
state, component versions, completed checks, explicit boundaries and final
status. It contains no access tokens, passwords, private configuration,
patient records or raw upstream diagnostics. To choose another output path:

```bash
npm run mcp:remote:verify -- --confirm-synthetic --report artifacts/remote-mcp/my-run.json
```

On normal completion or a handled failure, cleanup stops the SDK connections,
MCP server, proxy and tunnel, removes this run's Compose containers and
volumes, and deletes the private temporary files. A cleanup failure makes the
run fail. The scrubbed report remains. If the process is terminated abruptly,
inspect `docker compose ls` for the specific `lastehr-remote-<run-id>` project
and remove only that run's resources; stop its tunnel process as well. Do not
remove the ordinary demo stack or unrelated Docker projects.

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

The stdio configuration requires one FHIR credential before the process starts —
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

**One detail the implementation got wrong first, and adversarial review
caught.** Streamable HTTP carries a server-to-client request on the
originating call's SSE stream only when the request names that call
(`relatedRequestId`); otherwise it goes to the optional standalone GET
stream. The approval was first sent with no related id, so a host that never
opened a GET stream never saw a prompt, and every write hung until the request
timeout, then failed closed. The fix carries the tools/call id from the request
handler to the approval (`packages/mcp/src/request-context.ts`), so the prompt
rides the call's own stream, which is what the MCP spec says SHOULD happen. A
proving test drives an approval through a client whose fetch answers every GET
with 405.

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
- **Needs no shared Medplum credential.** The exchange path checks no client
  secret. Each session's FHIR client holds only its exchanged token.
- Costs the operator an identity provider and one Medplum project setting. The
  probe shows the exchange grant refuses a client with no identity provider
  configured, so this setup is required, not optional.

**Recommended: D2**, because it keeps authorization decisions outside this
project. D1 stays possible later for operators with no identity provider, and
it would be an additive change rather than a replacement.

## Token-exchange probe with a mock identity provider (Medplum 5.1.35, 2026-08-27)

This historical probe covers token exchange with a mock identity provider
and direct FHIR calls. As of 2026-08-27, a complete remote MCP run with a real
identity provider had not been verified. The [successful real identity-provider
evaluation](#run-the-real-identity-provider-evaluation) followed on 2026-10-22.
The earlier probe tested whether token exchange resolves the caller's Medplum
identity and enforces that identity's `AccessPolicy`. The rig was a local,
disposable stack: Medplum 5.1.35 with Postgres and Redis in Docker, a throwaway
project, and a mock identity provider serving one `/userinfo` response.
Nothing touched a hosted project. The version line matches the `@medplum/core`
5.1.x this repository already depends on.

Setup: a project with one synthetic Patient and one synthetic Observation, an
`AccessPolicy` named `PatientOnly` granting `Patient` as `readonly` and **not**
listing `Observation`, a user invited with that policy, and a
`ClientApplication` whose `identityProvider.userInfoUrl` pointed at the mock.

**The exchange works, and it needs no client secret.** A request with only
`client_id`, `subject_token`, and `subject_token_type` returned HTTP 200. The
response named the user the mock identified:
`Practitioner/… "Limited User"`. No pre-existing Medplum credential was sent,
which confirms the source reading: the exchange needs no shared Medplum secret.

**The exchanged token is bounded by that user's `AccessPolicy`.** This is the
claim the whole design rests on, and it holds:

| Request with the exchanged token | Result | Admin control |
| --- | --- | --- |
| `GET Patient/{id}` | **200** | 200 |
| `GET Observation/{id}` | **403 Forbidden** | 200 |
| `GET Observation?_count=5` | **403 Forbidden** | — |
| `PUT Patient/{id}` (policy says readonly) | **403 Forbidden** | — |

The same server returns 200 for both resources to an admin token with no access
policy, so the 403s are the policy at work rather than a broken rig. A remote
MCP server built this way therefore reaches exactly what the caller's own
Medplum identity reaches, and nothing more.

**`aud` is the Medplum server**, matching the hosted probe. That is why an
authorization server other than Medplum is still required for the inbound leg.

### Correction: the multi-project caveat was overstated

An earlier revision of this note warned that `forceUseFirstMembership: true`
would let a multi-project user land in an arbitrary project unless the request
pinned `membershipId`. **Tested, and that is wrong for the path D2 uses.**

The user was invited into a second project, so they held two memberships. The
exchange through the project-scoped `ClientApplication` still returned the
client's own project. The reason is in the handler: `projectId = await
getProjectIdByClientId(clientId, undefined)` runs before the login, so
`forceUseFirstMembership` chooses among memberships *within that project*, not
across projects.

The warning applies only to the server-level external auth path
(`useServerExternalAuth`), where `projectId` is set only if the request supplies
`membershipId`. D2 uses a `ClientApplication`, so it is not exposed. Pinning
`membershipId` stays available and is still worth sending, but it is not the
correctness requirement the earlier revision claimed.

### One operator requirement the probe surfaced

Medplum refuses the userinfo call outright until the URL is HTTPS on a public
address. The first attempt failed with `Outbound request blocked: HTTPS is
required`, from the SSRF guard in `packages/server/src/util/url.ts`:
`createSafeConnect` rejects any non-HTTPS protocol, unsafe hostnames, and
private IP addresses. The probe only proceeded because the local config set
`allowUnsafeOutbound`, which `safeFetch` honors and which no real deployment
should set.

So D2's documentation must state it plainly: **the identity provider's
`/userinfo` endpoint must be reachable over public HTTPS.** An operator testing
against a provider on a private network will see a misleading
`Failed to verify code — check your identity provider configuration` and no
indication that the protocol was the cause.

## Source evidence for D2 (medplum/medplum `main`, read 2026-08-23)

The hosted probe of 2026-08-22 could not reach the exchange grant because its
project had no identity provider configured. The following source reading
preceded the mock-provider probe above. It examined
`packages/server/src/oauth/token.ts` on Medplum's `main` branch.

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

**This server needs no shared Medplum credential.** The handler validates the
caller by calling the identity provider's user-info URL with the subject token.
It never checks a client secret on this path. The trust chain is caller →
identity provider → Medplum. Last EHR receives a per-caller token for the
session rather than using a shared token or client secret.

**One caveat, since corrected by the live probe.** The call passes
`forceUseFirstMembership: true`, which reads like a multi-project hazard. It is
not, for the `ClientApplication` path D2 uses: the client's project scopes the
login first. See "Correction: the multi-project caveat was overstated" above,
which records the test.

**Our `invalid_client` result is explained.** The observed
`{"error":"invalid_request","error_description":"Invalid client"}` is the path
taken when no identity provider resolves for the client. It confirms the
configuration requirement rather than a defect.

**Evidence limit.** This is the implementation on `main`. The hosted
`api.medplum.com` may run a different version, and a self-hosted operator
certainly may. So this narrows the live probe rather than replacing it: the
probe must still confirm the membership binding and the `AccessPolicy` effect
against the deployment in use.

## What shipped (0.4.0)

`LASTEHR_MCP_TRANSPORT=http` starts an HTTP server (`packages/mcp/src/remote-server.ts`)
that fronts one MCP `Server` per session. Stdio is untouched: the CLI loads the
module only on the http branch, by dynamic import. No new dependency: the SDK's
own Node transport is driven through `req.auth`.

| Variable | Meaning |
| --- | --- |
| `LASTEHR_MCP_TRANSPORT` | `stdio` (default) or `http` |
| `LASTEHR_MCP_RESOURCE` | This server's RFC 8707 resource identifier. Feeds both the required token audience and the metadata document, so the two cannot drift |
| `LASTEHR_MCP_OAUTH_ISSUER` | The authorization server that issues tokens for this resource |
| `LASTEHR_MCP_OAUTH_JWKS_URI` | Its JWKS, for offline signature verification |
| `LASTEHR_MCP_REQUIRED_SCOPES` | Comma-separated scopes every caller must present (optional) |
| `LASTEHR_MCP_EXCHANGE_CLIENT_ID` | The Medplum `ClientApplication` with the identity provider configured, used for the RFC 8693 exchange |
| `LASTEHR_MCP_TOKEN_ENDPOINT` | The FHIR server's token endpoint |
| `LASTEHR_MCP_MEMBERSHIP_ID` | Optional `ProjectMembership` to pin during the exchange |
| `LASTEHR_MCP_HTTP_HOST` / `_PORT` | Bind address; loopback and 3400 by default |

All five OAuth values are required; a missing one stops startup, because a
server with no audience to require would accept tokens it must refuse. `http`
refuses `FHIR_BACKEND=hapi` (no auth, no per-user identity). `http` does not
require a shared Medplum credential; the exchanged tokens belong to individual
sessions. A non-loopback bind is refused unless the resource identifier is
`https`, because bearer tokens must not cross a network in plaintext; TLS
terminates in front of this process.

**Session binding.** A session is bound at initialize to `(issuer, client_id,
sub)` of the caller who opened it. Every later request — POST requests,
POST-carried JSON-RPC responses such as elicitation answers, GET stream attach,
DELETE — is bearer-verified again and must resolve to the same principal, or it
is answered with a 404 byte-identical to an unknown id. `sub` is required to
open a session.

**Fail closed.** Exchange failure or timeout: 502, no session. Expired, revoked,
or idle credential: 404 and teardown. Capacity is a hard bound that counts
pending reservations and never evicts (503). Bodies are capped on every POST
(413). The verifier's own errors are 401/403/500 with nothing constructed. No
token appears in any log line, body, or header; the transport receives an
`AuthInfo` with an empty token and the `Authorization` header is stripped from
the raw headers the SDK exposes to handlers.

**Adversarial review before landing.** Six attack lenses (session hijack, token
leakage, fail-open paths, resource exhaustion, SDK contract misuse, test
adequacy) with three refuters per finding confirmed sixteen real issues; all
are fixed and each has a test. Besides the elicitation-stream correction
above: an id-less initialize is refused before any exchange (it would have
committed a session nobody could address); the body is read before the
registry lookup so a session torn down mid-upload is not handed a dead
transport; 413 is actually delivered (the default async iterator destroys the
socket on early return); the exchange is bounded by a timeout so a stalled
token endpoint cannot pin capacity; `close()` refuses in-flight initializes.

**Tests.** 33 socket-free unit tests, 22 loopback tests with the real SDK
client, and the two proving tests this note demanded: an elicitation-capable
client is offered the write tools and its approval over HTTP commits a tagged
write; a client without elicitation is offered no write tool, and a call to
one creates nothing, while a capable client in the same process does see them.

**Residual risks the implementation adds to the list below.**

- The MCP SDK retains a request's response in its internal maps when the
  client aborts mid-call. Bounded by session lifetime; an upstream matter,
  recorded rather than patched because the fix would reach into SDK privates.
- The exchange timeout releases the capacity reservation, but the underlying
  fetch may linger until Node's own timeouts.
- Sessions live in one process's memory. Several instances behind a load
  balancer need sticky routing, or a re-routed request answers 404 and the
  client re-initializes (correct, noisy, one Medplum login each).
- The real identity-provider [evaluation harness](#run-the-real-identity-provider-evaluation)
  passed locally on 2026-10-22. Hosted Medplum, deployed public MCP TLS,
  real-host approval UI and reviewer identity still need separate evidence.

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

The local identity-provider example and backend permission checks are
answered by the evaluations above. Deployment verification remains:

1. ~~Worked identity-provider example.~~ **Answered for the local fixture.**
   The disposable harness uses Keycloak
   `26.8.1` with experimental native RFC 8707 support and Medplum `5.1.35`.
   All 18 checks [passed on 2026-10-22](./evidence/remote-mcp-2026-10-22.json).
   Hosted Medplum, deployed public MCP TLS, a real MCP host's human approval
   interface and reviewer identity still need separate verification.
2. ~~Refresh.~~ **Decided: fail closed.** When the exchanged credential
   reaches its deadline the session is torn down and the next request answers
   404, so the client re-initializes under its current token and a fresh
   exchange runs. There is no refresh path and no code that could obtain a
   second FHIR credential for a live session.
3. ~~Does the exchanged token carry the caller's `AccessPolicy`?~~
   **Answered: yes.** Verified live on Medplum 5.1.35 — see the probe above.
   Worth re-checking against a hosted deployment before release, since the
   hosted version may differ.
4. ~~Membership pinning.~~ **Answered: not a hazard for this path.** The
   client's project scopes the login. See the correction above.

## Sequence

1. This design note.
2. Probe Medplum for RFC 8707 audience support and token format. **Done, see
   above.** The result rules out Medplum as the authorization server.
3. Transport plus resource-server validation, off by default, with the
   per-session FHIR client. **Done (0.4.0).**
4. The two write-path proving tests. **Done**, plus 53 more.
5. Threat-model boundary, support-matrix row, and MCP guide updates. **Done**
   in the same release.
6. A reproducible Keycloak/Medplum evaluation harness. **Done: all 18 checks
   passed on 2026-10-22**, with [recorded evidence](./evidence/remote-mcp-2026-10-22.json).
   Hosted Medplum, public MCP TLS, real-host human approval and reviewer
   identity remain separate follow-up checks.
