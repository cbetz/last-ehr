# Hosted Synthetic Work

The hosted Work service exposes Last's four durable work tools over
Streamable HTTP MCP, with OAuth assistant identities and a separate browser
reviewer sign-in. It is a dedicated Node process with a persistent SQLite
volume and a private HAPI FHIR stack. It reads and writes only the exact
invented fixture used by the [local Work Lab](./assistant-work.md).

An **allowlisted synthetic pilot** is running at
[work.lastehr.com](https://work.lastehr.com), separately from the marketing
site's Vercel deployment. On October 25, 2026, **native Grok Bot 0.75.8 drafted
work from an ordinary request**, a human approved it in Last, and Grok retrieved
the verified Task receipt. The assistant used a dedicated user-delegated OAuth
connection with `work:assistant offline_access`.

The initial request failed to find the connector. Naming **Last Work Native**
and clarifying its connection status allowed the Bot to resume. The operator
supplied no draft wording, tool arguments, or idempotency key. After the human
approved the draft, asking “Approved. Did it save?” returned the saved Task
and version without supplying its ID or hash. Grok did not claim patient
contact. Independent private-store and FHIR checks found one new job, zero
matching Tasks before approval, and exactly one matching Task afterward;
the approved fields, assistant ownership, historical Tasks and runtime matched.

This is native UI observation backed by independent stored-state checks.
The app did not expose raw tool payloads. An earlier native Bot run used
operator-specified draft text and tool arguments; that prescribed round trip
is separate from this model-written draft. Grok chat remains unverified.

On October 24, 2026 (October 25 UTC), a scripted
MCP SDK client proposed work, a separate reviewer signed in through real
OIDC and authorized approval, and private FHIR checks found **zero matching Tasks
before approval and exactly one afterward**. Exact Task readback and the
same receipt survived a Work service restart on the same image. The
[public verification record](/evidence/hosted-work-2026-10-24.json) pins the
deployment revision and observed timestamps.

A separate [qualified Grok 4.7 API run](/evidence/grok-work-2026-10-24.json)
used xAI's Responses API and Last's remote MCP tools. A human approved the
exact synthetic proposal in Last; a fresh Grok API request retrieved its
verified Task receipt. Independent private FHIR reads found zero matching
Tasks before approval and one exact Task afterward. The earlier Task/1002
remained unchanged.

The first response parser marked both proposal-phase calls as failed and did
not retain their raw provider status/error fields. The retained payloads
matched Last through a fresh SDK read; **the original provider tool success
status remains unresolved**. The later Grok receipt read passed with retained
provider classifications. This is qualified API evidence.

Access is operator configured for explicitly allowlisted assistant identities
and one reviewer. The deployment has no self-serve enrollment. The local
[Claude Code acceptance](./evidence/work-mcp-2026-10-23.md) is a separate
native-client result with its own tested scope.

## What is different from the local connector

| Surface | Local Work MCP | Hosted Work |
| --- | --- | --- |
| Client transport | Checkout-only stdio | Authenticated `/mcp` Streamable HTTP |
| Assistant identity | Disposable assistant lab key | Signed, audience-bound OAuth access token and explicit issuer/client/subject allowlist |
| Reviewer | Separate disposable lab-key browser | Configured OIDC subject, authorization code + PKCE, separate browser session |
| Work state | Local private SQLite | Private SQLite on a persistent deployment volume |
| Chart | Exact invented local HAPI fixture | The same exact invented fixture in a private, dedicated HAPI stack |

Both expose `read_work_context`, `propose_work`, `get_work`, and `cancel_work`.
Approval remains in Last. Neither interface exposes an assistant approval or
direct-save tool. A saved Task records a follow-up request, not patient contact
or completed care. Ordinary MCP tools carry Last's durable Work IDs; the MCP
Tasks extension is not implemented.

The service currently supports **one workspace, one configured reviewer, and
one process/replica**. Several explicitly allowed assistant identities can use
that workspace, and each can retrieve or cancel only its own work. General
multi-tenant hosting and a shared multi-reviewer inbox require further work.

## Configure the identity provider

Use an authorization server that signs JWT access tokens specifically for
your Work MCP resource. A generic Medplum FHIR token is addressed to Medplum,
so it must not be reused here. The existing
[remote FHIR MCP guide](./remote-mcp.md) documents that separate token exchange
path; it serves a different tool interface.

For the assistant connection:

1. Register the MCP client or dedicated assistant service identity with your
   provider. Configure its allowed sign-in/redirect flow according to the
   external client's requirements.
2. Issue access tokens with `iss` equal to the configured issuer, `aud` equal
   to `https://YOUR_WORK_ORIGIN/mcp`, scope `work:assistant`, a bounded `exp`,
   and verified `sub` and `client_id` (or `azp`).
3. Add each exact client ID/subject pair to `assistantIdentities`. Unlisted
   identities are refused even with an otherwise valid token. The configured
   reviewer subject is never accepted as an assistant.

For the reviewer:

1. Register a separate OIDC client, with exact redirect URI
   `https://YOUR_WORK_ORIGIN/auth/callback`, authorization code flow, and PKCE
   S256. The service requests the `openid` scope.
2. Configure the exact reviewer `sub` from the identity provider. Email text,
   a requested role, and the model's identity claims do not select this role.
3. A confidential client can set `reviewerClientSecret` in the private
   configuration. This implementation sends it using `client_secret_post`;
   enable that method at the provider or use a registered public PKCE client.

The service validates ID-token signature, issuer, audience, nonce, subject,
issued-at and expiry. The browser's server-authenticated login cookie binds
state, nonce and PKCE for five minutes, without allocating a shared queue for
anonymous sign-in attempts. The identity provider must enforce single-use
authorization codes. Last clears the login cookie on every callback.
Reviewer sessions use opaque server-side IDs and expire within one hour or
the ID token's earlier expiry. A process restart invalidates pending sign-ins
and reviewer sessions; durable work remains on disk. Local logout invalidates
the Last session, without logging the user out of their identity provider.

Startup and the inbox's batch reconciliation check at most ten interrupted
items at a time. A reviewer can reconcile an individual uncertain item by its
Work ID. Shutdown stops before additional reconciliation lookups; it never
submits a replacement Task to resolve an uncertain outcome.

Use the reviewer's own browser/profile. Do not sign that reviewer into a
Grok Bot cloud browser or give its credentials to an assistant. Grok Bot
documents that Bots on an account share browser sessions and files on its
computer. [Grok Bot computer model](https://docs.x.ai/grok-bot/computer-and-apps)

## Configure and run the service

For the selected low-cost pilot, follow the step-by-step
[OVHcloud and Auth0 runbook](./ovh-work.md), including ordering, DNS, reviewer
sign-in, private configuration, and recovery checks.

Start from [work-hosted.example.json](../work-hosted.example.json). It contains
placeholder public URLs and identity subjects, without real credentials.
Create your private `work-hosted.json`, fill in the actual endpoints and
identities, and set mode `0600` or `0400`. The file is ignored by Git and the
Docker build context. Keep the example itself free of secrets.

```bash
cp work-hosted.example.json work-hosted.json
chmod 600 work-hosted.json
```

The configuration uses an exact HTTPS public origin with no path or trailing
slash. Identity endpoints must use HTTPS and the same origin as the issuer.
The store path is absolute. Production configuration accepts only the private
Compose FHIR address `http://hapi:8080/fhir`; the local lab's loopback validator
has not been relaxed. No `.env.local` or model-provider key is loaded.

Build and start the dedicated stack on a Docker host:

```bash
docker compose -p lastehr-work-hosted -f docker-compose.work.yml build
docker compose -p lastehr-work-hosted -f docker-compose.work.yml up -d
```

The image runs as nonroot UID/GID `1000`, with a read-only root filesystem.
The bind-mounted private configuration must be readable by that UID. On a
Linux host, arrange its ownership or secret mount accordingly; do not make
the configuration world-readable. The fresh named work volume inherits UID
1000 ownership and private `0700` directories; the database is `0600`.
An existing volume must retain those permissions.

Only Work is mapped to host loopback port 3400. HAPI and Postgres have no
published ports and use a private Docker network. Only Work has outbound
network access, for its configured identity provider. The service waits up to
three minutes for HAPI to become available and fails if the exact synthetic
fixture or required conditional-create capability is invalid.

Place a TLS ingress in front of `127.0.0.1:3400`, serving exactly your configured
`publicOrigin`. Preserve the original public Host header and allow streaming
responses; do not rewrite the MCP path or pass request bodies into access
logs. Keep the raw backend port private. A generic reverse-proxy example:

```caddyfile
work.example.org {
    reverse_proxy 127.0.0.1:3400
}
```

`GET /health` returns readiness and synthetic mode. Protected resource
metadata is available at `/.well-known/oauth-protected-resource/mcp` and is
referenced by the unauthenticated MCP `WWW-Authenticate` challenge. The
external authorization server owns discovery, client registration, consent,
and token issuance. Last does not mint assistant access tokens.

Use persistent disks, keep one replica, and retain the same issuer/reviewer
identity when resuming existing work. For a cold backup, stop Work, preserve
its entire volume including SQLite sidecars, and back up the private FHIR
database consistently. Test restoration before relying on it. Do not use
`down --volumes` if work records must survive. Live replication, automatic
failover, online backup, and an administrative identity migration are not
provided by this pilot.

## Connect Grok Bot and verify the result

Grok Bot's official documentation describes custom MCP **Remote HTTPS**
plugins with either a Bot credential or per-person OAuth sign-in. Its usual
execution computer is cloud hosted. A localhost URL on your laptop will not
reach this service from that computer.
[Custom MCP plugins](https://docs.x.ai/grok-bot/team-bots)

### Persistent assistant sign-in with Auth0

The native test above used the OAuth configuration below. Grok Bot's native
Authenticate action did not launch a browser, so authorization was completed
through the same connector in Cursor's web interface. The saved grant named
the intended distinct Google assistant user, Work audience and only
`work:assistant offline_access`. The separate reviewer's Google sign-in was
verified after configuration, with the existing first-party assignments
preserved.

Auth0 recorded a successful refresh-token exchange. A read-only native call
after the original one-hour access token expires is still pending, so
**unattended renewal after access-token expiry is not yet verified**.

Pre-register a dedicated **third-party Native/public** Auth0 client with
authorization code + PKCE S256, token endpoint authentication `none`, and
only the `authorization_code` and `refresh_token` grants. Cursor operates the
OAuth client and callback; creating its registration yourself does not make
that runtime a first-party Last application. Ownership is fixed at creation.
Auth0's strict third-party mode requires consent and currently excludes
OIDC scopes and ID tokens, so request `work:assistant offline_access` without
`openid`, `profile`, or `email`. Last verifies the access token's subject;
the separate reviewer keeps its existing OIDC flow.
[Application ownership](https://auth0.com/docs/get-started/applications/first-party-and-third-party-applications),
[Strict third-party controls](https://auth0.com/docs/get-started/applications/third-party-applications/security-controls)

Register only `https://www.cursor.com/agents/mcp/oauth/callback` for this
cloud connection. Cursor staff identifies it as the Grok Bot callback;
`http://localhost:8787/callback` is the local IDE flow. This pre-registered
route needs no Dynamic Client Registration. Use the actual client ID in the
host's secure HTTP MCP configuration:

```json
{
  "mcpServers": {
    "Last Work Native": {
      "url": "https://work.lastehr.com/mcp",
      "auth": {
        "CLIENT_ID": "YOUR_PUBLIC_ASSISTANT_CLIENT_ID",
        "scopes": ["work:assistant", "offline_access"]
      }
    }
  }
}
```

This is the full `mcp.json` shape. Cursor web's **Edit JSON** dialog expects
only the inner server map: start with `"Last Work Native"` inside the outer
braces and omit the `mcpServers` wrapper.

Public PKCE uses no `CLIENT_SECRET` or manually copied bearer header. Verify
the native authorization request actually includes those scopes, the exact
callback, and `resource=https://work.lastehr.com/mcp`.
[Cursor OAuth configuration](https://cursor.com/docs/mcp),
[Grok Bot callback clarification](https://forum.cursor.com/t/grok-bot-cloud-mcp-oauth-leaves-env-asana-client-id-unsubstituted/168404)

Check that Auth0's **Resource Parameter Compatibility Profile** and **Include
Issuer in Authorization Responses** are enabled; leave existing enabled
values unchanged. On the Work API, enable **Allow Offline Access**, set
**User-Delegated Access** to **Per-app authorization**, and grant only the
new client `work:assistant` with subject type `user`. Keep the existing
client-access policy, M2M grant, reviewer configuration, and first-party
consent setting. Third-party consent remains mandatory.
[Resource compatibility](https://auth0.com/ai/docs/mcp/guides/resource-param-compatibility-profile),
[Per-application API grants](https://auth0.com/docs/get-started/applications/application-access-to-apis-client-grants)

Google must be a domain-level connection for this login. In the existing
Google social connection's Settings, enable **Promote Connection to Domain
Level** and save. This changes the shared connection, making Google login
available to all third-party clients in the tenant; it does not grant API
access. Preserve its Google credentials, scopes, and first-party application
assignments. Check those assignments before and after saving, including that
the reviewer remains enabled, and verify reviewer sign-in still works.
[Domain-level connections](https://auth0.com/docs/authenticate/identity-providers/promote-connections-to-domain-level)

Configure rotating, expiring refresh tokens with a **604800-second maximum
(seven days)** and **86400-second idle lifetime (one day)**, with both infinite
lifetime options disabled. Retain the one-hour access-token lifetime. Grok
Bot documents that connected-app tokens remain on Cursor's backend, outside
the Bot's computer and model.
[Refresh expiration](https://auth0.com/docs/secure/tokens/refresh-tokens/configure-refresh-token-expiration),
[Grok Bot token custody](https://cursor.com/docs/grok-bot/work#connect-apps)

Sign in with a distinct Google assistant user, then allowlist its exact
verified Auth0 client ID and `sub` in `assistantIdentities`. A separate client
ID does not make the reviewer's raw `sub` eligible: Last rejects that subject
for every assistant client. The new client/user pair owns new work separately;
it cannot retrieve or cancel jobs owned by the earlier M2M assistant identity.

Verify renewal with a read-only native call after the original access token
expires. Last caps each MCP session at its initial token expiry, so the host
must reconnect with the refreshed token and retrieve a Work ID owned by the
same client/user pair. Do not resubmit a proposal to test renewal. Record the
actual native sign-in, granted scope, renewed access, and reconnect result
before claiming persistent Grok Bot OAuth support.

After deploying the service and identity provider:

1. Add its `https://YOUR_WORK_ORIGIN/mcp` URL as a Remote HTTPS custom MCP
   connection in the actual client. Complete the registered OAuth flow, or
   configure the narrowly scoped, short-lived assistant token through the
   host's secure credential UI when that mode is available. Never put it in
   a prompt, command argument, shared Bot template, or screenshot.
2. Confirm exactly the four advertised Work tools. Name the connector in an
   ordinary request, for example: “Using Last Work Native, look at Alex's
   synthetic chart and draft a follow-up task for me to review.” Let the Bot
   compose the draft. The tool instructions require it to retain the exact
   source version, chart-read receipt and submission key; no draft wording or
   tool arguments need to be supplied in the request.
3. Keep the returned Work ID and independently verify that the draft is
   pending and no matching Task exists before approval. If the client cannot
   find the connector, resolve that connection first; do not submit a second
   draft to repair a missing or uncertain result.
4. In the separate human-owned reviewer browser, sign in to Last, inspect
   the exact resource/source/hash, and approve it. Independently query the
   private FHIR backend by its work identifier and compare the saved fields.
5. Back in the same Bot conversation, ask “Approved. Did it save?” Compare its
   answer with Last's verified receipt. To test a new client session separately,
   reconnect and retrieve that same Work ID with `get_work`; it must return
   `succeeded` and the exact receipt without resubmitting. A separate declined
   proposal must leave no matching Task.

Every HTTP MCP request revalidates the token. A session is bound to its
authenticated issuer/client/subject identity and capped by its initial token
expiry, idle timeout, and an hour-long maximum. A renewed token may require
a new MCP session. New sessions can retrieve a saved Work ID without another
chart read. After an uncertain submission, keep the original idempotency key;
retry only the exact proposal content. Changed drafts conflict rather than
create replacement work.

### Carry a chart read across connections

Hosted `read_work_context` returns a top-level `contextReceipt` alongside
`context`. This random, opaque value proves a bounded chart read for the
verified principal, tenant, and assistant subject. Send that exact value in
the optional `propose_work.contextReceipt` field to carry the read across
independent connections authenticated as that same identity. A new connection
without the receipt cannot use another connection's implicit chart read.
Existing clients that omit the field can still use their own connection's
last read receipt.

Only the latest read for an identity remains valid. Receipts expire after
five minutes or the originating token's expiry, whichever comes first. They
are held only in memory; a service restart or shutdown invalidates them.
After an expired receipt or a failed or changed chart refresh, read the chart
again. Every proposal still freshly checks the patient, source reference, and
source version before submission. If a proposal's outcome is uncertain, keep
its original idempotency key and exact content while checking the existing
work; do not submit a replacement under a new key.

This receipt is proof of a chart read, not reviewer approval or a FHIR save.
The same four tools and separate human review remain in place; no model
provider key is needed by Last for this mechanism.

Record the exact client/version, source revision, deployment, visible native
activity, separate review method, before/after FHIR assertions and receipt.
Distinguish observed UI text from raw tool payloads when the client does not
expose them. Record any connector-discovery clarification or setup fallback;
do not describe that run as an uninterrupted single-request flow. The native
test above verifies its observed scope; the qualified Grok API run does not
verify a Bot connection, reconnect or post-expiry renewal.
The checkout's automated HTTP/OIDC fixtures use simulated identities and an
automated reviewer; they are separate from these live pilot observations.

All prompts, chart data, Task descriptions, and demonstrations remain wholly
invented. This service does not establish clinical correctness, real-chart
authorization, hosted Medplum support, or HIPAA readiness. See the separate
[deployment groundwork](./hipaa-deployment.md) before considering patient data.

## Verify a checkout

```bash
npm test
npm run test:work:hosted
```

The browser command defaults to actual HAPI at
`http://127.0.0.1:8080/fhir`. It exercises HTTP MCP, real signed JWT/JWKS and
authorization-code/PKCE HTTP exchanges against a **test identity provider**,
a separate automated reviewer browser, exact FHIR read-back, and service
restarts before and after approval. It also verifies denial and cancellation
without a saved Task and renders proposal text as literal text.

For UI development without a FHIR server, explicitly select the in-memory
backend:

```bash
LASTEHR_HOSTED_E2E_BACKEND=fixture npm run test:work:hosted
```

That mode is a test fixture and does not verify HAPI persistence. The browser
report records the backend, simulated identity provider, scripted SDK client,
absence of a model/Grok call, before/after counts, receipt, and restart checks.
GitHub CI runs the real HAPI path, uploads that report and screenshots, and
separately builds the nonroot container and checks its runtime entry point
and volume permissions. These checks do not establish that a public
deployment or identity provider has been configured.
