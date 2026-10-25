# OVHcloud Work Pilot

This runbook deploys the [hosted Work service](./hosted-work.md) at
`https://work.lastehr.com`, with Auth0 assistant credentials and a separate
reviewer login. It covers one synthetic workspace, one reviewer, and one
server. The allowlisted pilot passed a public scripted-SDK flow with separate
human-authorized review on October 24, 2026: zero matching Tasks before
approval, one exact saved Task afterward, and the same receipt after a Work
restart. See the [verification record](/evidence/hosted-work-2026-10-24.json).
Grok Bot acceptance remains unverified; enrollment remains operator configured.
The steps below describe how to reproduce and operate the deployment.

## 1. Order the server

In the [OVHcloud US VPS configurator](https://us.ovhcloud.com/vps/), choose
**standard VPS-2, Oregon, 4 vCores, 8 GB RAM, 75 GB storage, Ubuntu 24.04,
x86_64**, with month-to-month billing. Check that checkout shows the agreed
**$10/month before tax**, without annual prepayment or paid control panels.
Choose the standard region rather than a Local Zone. Keep the included
daily backup; extra retention can be added separately.

On October 24, the configurator offered Oregon for this plan; Virginia was
not listed. Confirm the available standard US region at checkout rather
than switching to a Local Zone to obtain a particular city.

Create or sign in to your own OVH account, add your SSH **public** key, and
complete checkout. Keep billing details, passwords, recovery codes and
private keys out of chat. Record the assigned public IPv4 address. OVH's
[VPS security guide](https://docs.ovhcloud.com/en/guides/bare-metal-cloud/virtual-private-servers/secure-your-vps)
describes SSH access and recovery.

## 2. Prepare Ubuntu and install Docker and Caddy

Connect using the account and IP supplied by OVH, usually `ubuntu`:

```bash
ssh ubuntu@YOUR_VPS_IPV4
sudo apt update
sudo apt upgrade
sudo apt install ca-certificates curl git jq python3 ufw gnupg nano
```

Install Docker Engine from its
[official Ubuntu repository instructions](https://docs.docker.com/engine/install/ubuntu/),
including `docker-ce`, `docker-ce-cli`, `containerd.io`,
`docker-buildx-plugin`, and `docker-compose-plugin`. Use the repository
installation method, then check:

```bash
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

Install the stable Ubuntu package using
[Caddy's official repository instructions](https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
Its package installs a `caddy` systemd service. Do not add a second proxy
container or expose the Work container directly.

Before enabling the host firewall, replace the example with your current
operator public IP, keep this SSH session open, and confirm a second SSH
session works after applying the rules:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from YOUR_OPERATOR_PUBLIC_IP to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Add a new SSH rule before connecting from another location. Do not allow
public access to 3400, 8080, or 5432. Docker can route published ports around
UFW, so preserve the checked-in loopback-only Work binding and the absence
of HAPI/Postgres port mappings. See
[Docker's firewall behavior](https://docs.docker.com/engine/network/packet-filtering-firewalls/#docker-and-ufw).

The checked-in starting memory limits are 1 GiB for Work, 3 GiB for HAPI
(with a 2 GiB JVM heap), and 1 GiB for Postgres. Container logs rotate at
10 MiB with three files per service. These leave room on an 8 GiB host for
Ubuntu, Docker and Caddy; verify actual memory/disk use after startup and
under the acceptance workload. These budgets are not load-tested capacity.

## 3. Set DNS

At the DNS provider for `lastehr.com`, add an **A record** named `work`
pointing to the VPS IPv4. Start with DNS-only routing if the provider offers
a proxy. Do not add an AAAA record unless that IPv6 address is configured
and reachable. Leave the existing website records in place.

```bash
getent ahostsv4 work.lastehr.com
```

Wait until it resolves to this server before requesting HTTPS certificates.
Caddy needs incoming TCP 80 and 443 for this setup.
[Automatic HTTPS](https://caddyserver.com/docs/automatic-https)

## 4. Create three Auth0 registrations

Use an Auth0 tenant you control. For this first deployment, use its standard
tenant domain consistently, such as `YOUR_TENANT.us.auth0.com`; do not mix
standard and custom domains. The issuer is the discovery document's exact
`issuer`, including its trailing slash.

### Last Work MCP API

In **Applications → APIs**, create `Last Work MCP`:

| Setting | Value |
| --- | --- |
| Identifier / audience | `https://work.lastehr.com/mcp` |
| Signing algorithm | RS256 |
| JWT profile | Auth0 |
| Maximum access token lifetime | 3600 seconds |
| Permission / scope | `work:assistant` |

Save the permission and authorize only the assistant application below.
[Auth0 API settings](https://auth0.com/docs/get-started/apis/api-settings)

### Last Work Reviewer application

Create a **Regular Web Application**, named `Last Work Reviewer`, with:

| Setting | Value |
| --- | --- |
| Allowed Callback URLs | `https://work.lastehr.com/auth/callback` |
| Application Login URI | `https://work.lastehr.com/auth/login` |
| Grant type | Authorization Code |
| ID token signing algorithm | RS256 |
| ID token expiration | 3600 seconds |
| Token endpoint authentication | Client Secret (Post) |

Enable the connection used by your own reviewer account. Record its exact
Auth0 **user ID** from User Management → Users, such as `auth0|...` or a
social connection's corresponding ID. That becomes `reviewerSubject`;
email text does not grant review access. Last adds state, nonce, and PKCE
S256 to its authorization-code request. It requests only `openid`.
[Application settings](https://auth0.com/docs/get-started/applications/application-settings),
[credential settings](https://auth0.com/docs/get-started/applications/credentials)

### Last Work Assistant application

Create a separate **Machine to Machine Application**, named
`Last Work Assistant`. Authorize it for `Last Work MCP` and only
`work:assistant`; use the Client Credentials grant. Do not authorize the
reviewer application for this permission.

Use Auth0's API test panel or a private local token request to obtain one
short-lived token with `audience=https://work.lastehr.com/mcp` and
`scope=work:assistant`. Read its claims locally to record the actual `sub`
and `azp` (or `client_id`). An ordinary M2M subject often ends in `@clients`,
but copy the actual issued value rather than constructing it. The assistant
allowlist requires this exact subject/client pair and refuses the reviewer
subject. Do not enable agent subject rewriting for this initial setup.
[Client Credentials flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/client-credentials-flow/call-your-api-using-the-client-credentials-flow),
[access token profiles](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles)

Keep the assistant's client secret in your private credential store or
operator token helper. Work itself needs only the assistant's public client
ID and subject. Never paste a token, client secret, or reviewer credentials
into a prompt, repository, screenshot, or chat. A decoded JWT is not proof
of authenticity; Last verifies its signature and claims when it is used.

## 5. Install a recorded revision and private configuration

On the VPS, clone the public repository, record the actual deployed commit,
and keep that revision for acceptance and rollback:

```bash
git clone --branch main https://github.com/cbetz/last-ehr.git
cd last-ehr
git rev-parse HEAD > "$HOME/lastehr-work-deployed-sha.txt"
umask 077
cp work-hosted.example.json work-hosted.json
nano work-hosted.json
```

Use these values, replacing every placeholder locally. Copy endpoint values
from `https://YOUR_TENANT.us.auth0.com/.well-known/openid-configuration`
and confirm they use the same tenant origin:

```json
{
  "schemaVersion": 1,
  "syntheticOnly": true,
  "publicOrigin": "https://work.lastehr.com",
  "listenHost": "0.0.0.0",
  "listenPort": 3400,
  "storePath": "/var/lib/lastehr-work/store/work.sqlite",
  "hapiUrl": "http://hapi:8080/fhir",
  "issuer": "https://YOUR_TENANT.us.auth0.com/",
  "jwksUri": "https://YOUR_TENANT.us.auth0.com/.well-known/jwks.json",
  "authorizationEndpoint": "https://YOUR_TENANT.us.auth0.com/authorize",
  "tokenEndpoint": "https://YOUR_TENANT.us.auth0.com/oauth/token",
  "reviewerSubject": "YOUR_EXACT_REVIEWER_USER_ID",
  "reviewerClientId": "YOUR_REVIEWER_CLIENT_ID",
  "reviewerClientSecret": "YOUR_REVIEWER_CLIENT_SECRET",
  "assistantIdentities": [
    {
      "clientId": "YOUR_ASSISTANT_CLIENT_ID",
      "subject": "YOUR_EXACT_ASSISTANT_TOKEN_SUB"
    }
  ]
}
```

`publicOrigin` has no trailing slash; the Auth0 issuer normally does. After
editing, assign the file to the container's UID 1000 and keep it private:

```bash
sudo chown 1000:1000 work-hosted.json
sudo chmod 600 work-hosted.json
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml config --quiet
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml build
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml up -d
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml ps
curl --fail --header 'Host: work.lastehr.com' http://127.0.0.1:3400/health
```

Do not loosen the file to world-readable if startup fails. Check UID,
ownership and mode; the service rejects nonprivate configuration. HAPI may
take several minutes on first boot. The configured `0.0.0.0` listener is
inside the container; Compose publishes it only at host `127.0.0.1:3400`.

## 6. Enable public HTTPS

On this dedicated new host, put the following in `/etc/caddy/Caddyfile`:

```caddyfile
work.lastehr.com {
    reverse_proxy 127.0.0.1:3400
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
curl --fail https://work.lastehr.com/health
curl --fail https://work.lastehr.com/.well-known/oauth-protected-resource/mcp
curl --include https://work.lastehr.com/mcp
```

Expect synthetic-only readiness, metadata naming the exact resource and
Auth0 issuer, and **401** with a `WWW-Authenticate` resource-metadata
challenge for the unauthenticated MCP request. Caddy preserves the incoming
Host by default. Keep the MCP path unchanged and response streaming enabled;
do not enable request-body, token, or callback-query logging.

## 7. Verify before announcing Grok support

In your own browser/profile, open `https://work.lastehr.com`, sign in through
Auth0, and confirm the reviewer inbox. A different user must be refused.
Keep this profile separate from any assistant-owned browser.

In the actual Grok Bot client, add `https://work.lastehr.com/mcp` as a
Remote HTTPS MCP connection using its secure credential UI, if that mode
is available. Start with the scoped, one-hour assistant token. Automatic
token renewal and the actual client's credential support still need
verification; creating an Auth0 application does not establish either.
[Grok Bot custom MCP documentation](https://docs.x.ai/grok-bot/team-bots)

Run the [hosted acceptance sequence](./hosted-work.md#connect-grok-bot-and-verify-the-result):
read the invented source, propose work, retain its Work ID and hash,
disconnect, approve in your separate reviewer browser, and reconnect to
retrieve the same verified receipt. There must be no approval tool among
the four assistant tools.

Independently count matching FHIR Tasks before approval and afterward. From
the VPS checkout, set `LAST_WORK_ID` to the returned UUID, then run:

```bash
LAST_WORK_ID=YOUR_RETURNED_WORK_UUID
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml exec -T work \
  node --input-type=module -e '
    const id = process.argv[1];
    if (!/^[a-f0-9-]{36}$/.test(id)) process.exit(1);
    const url = new URL("http://hapi:8080/fhir/Task");
    url.searchParams.set("identifier", "https://lastehr.com/work-lab/job|" + id);
    url.searchParams.set("_total", "accurate");
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) process.exit(1);
    console.log(JSON.stringify(await response.json(), null, 2));
  ' "$LAST_WORK_ID"
```

Require a total of **0 before review and 1 after approval**, with the exact
approved description, patient, source reference/version, identifier, and
receipt ID/version. Repeat with declined work and require zero matching
Tasks. Restart Work and retrieve the approved result again without a new
write. Record deployment SHA, real client/version, tool calls, review method
and before/after assertions. Until this passes, share the verified Claude
workflow and describe Grok as the next integration being tested.

## 8. Preserve state and test recovery

Work's SQLite volume and HAPI's Postgres volume form one deployment's state.
Do not run `docker compose down --volumes`, remove either volume, or reset
the synthetic fixture to fix a startup problem.

For a consistent first backup, use a brief maintenance window. Pull the
archive image before stopping the stack, choose a new private backup
directory, stop all three services cleanly, and archive both full volumes:

```bash
sudo docker pull alpine:3.22
sudo docker volume inspect lastehr-work-hosted_work-store lastehr-work-hosted_work-postgres
LAST_BACKUP_DIR="/var/backups/lastehr-work/$(date -u +%Y%m%dT%H%M%SZ)"
sudo install -d -m 700 "$LAST_BACKUP_DIR"
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml stop --timeout 60
sudo docker run --rm --network none --read-only \
  -v lastehr-work-hosted_work-store:/source:ro \
  -v "$LAST_BACKUP_DIR":/backup alpine:3.22 \
  tar -cpf /backup/work-store.tar -C /source .
sudo docker run --rm --network none --read-only \
  -v lastehr-work-hosted_work-postgres:/source:ro \
  -v "$LAST_BACKUP_DIR":/backup alpine:3.22 \
  tar -cpf /backup/work-postgres.tar -C /source .
sudo cp --preserve=mode,ownership work-hosted.json "$LAST_BACKUP_DIR/"
git rev-parse HEAD | sudo tee "$LAST_BACKUP_DIR/deployed-sha.txt" > /dev/null
sudo docker compose -p lastehr-work-hosted -f docker-compose.work.yml up -d
```

Require the volume inspection to succeed before continuing; these names
come from the fixed Compose project above. Confirm both archive commands
succeed before treating this as a backup.
Keep a protected off-server copy, including the private config, using
encryption and access you control. OVH's automatic server backup is useful
but does not replace this coordinated state capture and restore test.

Test on a separate host or isolated Compose project: restore **both**
archives into empty named volumes, preserving numeric ownership and modes;
restore the matching code and private configuration; verify SQLite remains
UID 1000/private and Postgres uses the same major version. Keep the test
stack private, use its own HTTPS origin and registered callback if testing
browser login, and never run two writers against one SQLite volume. Verify
the saved Work ID, source and Task receipt, then confirm a reconnect creates
no replacement Task. Record the restore result before relying on backups.

All chart data and demonstrations remain invented. This pilot does not
establish authorization for patient data or HIPAA readiness; see the
separate [deployment groundwork](./hipaa-deployment.md).
