# Quickstart

The published package path is the [README start](../README.md#start-here):
`npx -y @lastehr/mcp init`, then this repository's local HAPI stack. That
release's no-account backend is `FHIR_BACKEND=hapi` with `FHIR_BASE_URL` or
`HAPI_BASE_URL`. Local-lab failures are in
[Troubleshooting the local lab](#troubleshooting-the-local-lab).

The hosted demo is a separate browser walkthrough:

<https://www.lastehr.com/demo>

It uses synthetic patients, needs no account, and every write stops at an
approval card.

## Recorded approval and cancellation

[Watch the 90-second walkthrough](https://www.lastehr.com/demo/approve-and-decline.mp4)
or [view it on the homepage](https://www.lastehr.com/#walkthrough).

This is an edited, sampled screen recording of the fixed local synthetic
walkthrough, captured October 23, 2026, from clean source
[`f36d05d`](https://github.com/cbetz/last-ehr/tree/f36d05dde21c6e1c6847f2660a966afd2615c646)
(MCP package version `0.4.0`). No external model is called. The browser frames
are actual app captures; the adjoining pane shows separate paginated GET
snapshots from its disposable local HAPI FHIR store.

| Time | Transcript |
| --- | --- |
| 0:00–0:08 | A fixed synthetic walkthrough. The browser approval and FHIR persistence paths are real. |
| 0:08–0:22 | The 72 bpm proposal waits for a human decision. An independent read finds the original seven Observation IDs. |
| 0:22–0:32 | Inspect the proposed patient reference, LOINC 8867-4, value 72 bpm, and UCUM `/min` in the FHIR preview. |
| 0:32–0:36 | Approve and save. The pane keeps the last completed backend snapshot until the next read. |
| 0:36–0:48 | The new FHIR read finds eight Observations: exactly one added ID. Its reviewed fields and `AIAST` label pass the checks. |
| 0:48–1:00 | Submit again. Scripted mode repeats the same proposal; another read still finds the eight approved-state IDs. |
| 1:00–1:04 | Cancel and revise the second proposal. |
| 1:04–1:15 | Read FHIR again: the ID set is unchanged from after approval, with zero additional Observations. |
| 1:15–1:30 | Try the pinned walkthrough. These checks cover persistence mechanics, not clinical correctness, model quality, or production authorization. |

[FHIR proof JSON](https://www.lastehr.com/demo/approve-and-decline.proof.json)
· [English captions](https://www.lastehr.com/demo/approve-and-decline.vtt)
· [Capture method and limits](https://github.com/cbetz/last-ehr/blob/main/docs/evidence/demo-approval-2026-10-23.md).
The baseline was read before submitting the first proposal and rechecked
while its card was waiting. Both snapshots contained the same seven IDs.
The video uses edited timing and holds captured frames for readability.

To reproduce the recorded app version, use a clean directory and the
prerequisites below, check out `f36d05dde21c6e1c6847f2660a966afd2615c646`, then run
`npm ci` and `npm run demo:local`. Approve once, repeat and cancel, and compare
all paginated Observation IDs directly in your local FHIR store. Resource IDs
will differ between seeded stacks.

## Zero-key local synthetic demo with HAPI FHIR

Use this path when you want to inspect the approval loop without a Medplum
account or model-provider key.

Prerequisites:

- Node 22.18+ (or 24.2+)
- Docker

From a fresh checkout:

```bash
git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
npm run demo:local
```

The command starts HAPI FHIR and Postgres, waits for the server, resets and
seeds the synthetic records, then starts the app at
<http://localhost:3000/demo>. It forces the local HAPI + scripted settings for
its child processes, so it needs neither `.env.local` nor an external model
key. Your normal `.env.local` is not edited or used to select the backend or
model for this command.

On the first run, Docker may need to pull images and HAPI can take a few
minutes to initialize. Press Ctrl-C to stop Next.js; the local FHIR stack and
its data stay available. When you want to remove them, run:

```bash
npm run demo:local:down
```

This is a deterministic walkthrough, not an offline model bundle: it makes no
model-provider request and does not interpret the prompt. It always searches
the seeded Maria Garcia record, proposes a single `Heart rate: 72 bpm`
Observation, and waits for approval. The server rejects scripted mode unless
the opt-in flag, `FHIR_BACKEND=hapi`, and a local HAPI URL are all present; the
wrapped FHIR backend rejects reads or writes outside that synthetic record and
fixed observation.

The local HAPI server itself has no auth. Use it for local, single-tenant
synthetic evaluation only. Re-run `npm run seed` if the scripted demo says its
seeded patient is missing.

### Inspect the read-only MCP tools

The checkout also includes a separate MCP Local Lab for evaluating the two
chart-reading tools without FHIR/Medplum credentials or a provider API key:

```bash
npm run mcp:demo -- --client claude-code
```

It prepares the same local HAPI stack and prints a client registration command.
The MCP process is hard-wired to the local Docker endpoint and exposes only the
four repository fixture patients through `search_patients` and
`show_patient_info`. This is a synthetic evaluation path, not generic HAPI
support or a substitute for the published `@lastehr/mcp` package.
Claude Code or Cursor still uses its usual model account and may transmit those
synthetic tool results to its provider. Port 8080 must be free; leave the local
stack running while connected and use `npm run demo:local:down` when finished.
See the [MCP guide](./mcp.md) for Cursor/JSON configuration and the full boundary.

### Use a real model instead

`npm run demo:local` is intentionally fixed to the safe walkthrough. To
exercise the full agent instead, copy `.env.example` to `.env.local`, set
`FHIR_BACKEND=hapi`, `FHIR_BASE_URL=http://localhost:8080/fhir`,
`NEXT_PUBLIC_QUICKSTART=true`, and a supported provider configuration, for
example:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

Leave `LASTEHR_SCRIPTED_DEMO` and `NEXT_PUBLIC_SCRIPTED_DEMO` unset, then run
the HAPI stack:

```bash
docker compose up -d
npm run fhir:wait
npm run seed
npm run dev
```

Public `NEXT_PUBLIC_*` values are read at startup. The real agent can use its
full tool surface (see [FHIR coverage](./fhir-coverage.md)) and requires a
tool-capable model credential.

To run the app itself in Docker too:

```bash
npm run docker:local
```

This uses `docker-compose.yml` plus `docker-compose.app.yml` and reads the
build-time public values from `.env.local`.

Separately, if you only want the scripted zero-key lab without a local build:
release tags and manual publish runs push a prebuilt image whose scripted
configuration is baked in at build time, so it always runs the scripted
walkthrough and cannot run the real-model setup described in this section; see
[Pull and run from GHCR](./deployment.md#pull-and-run-from-ghcr), which also
covers what to do if no public image has been published yet.

## Troubleshooting the local lab

`npm run demo:local` and `npm run mcp:demo` need Node 22.18+ (or 24.2+) and a
running Docker daemon. They do not need `.env.local`, a Medplum account, or a
model key. `demo:local` sets the local HAPI and scripted-walkthrough variables
for its own processes.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Docker does not appear to be running. Start Docker Desktop (or your Docker daemon) and re-run this command.` | `docker` is on `PATH`, and `docker info` failed. The daemon is stopped or unreachable. | Start Docker Desktop or the Docker daemon, then re-run the same command. |
| `Could not start docker: spawn docker ENOENT` | The `docker` binary is not on `PATH`. | Install Docker, then re-run the command. |
| Compose reports that `127.0.0.1:8080` is already allocated, or `address already in use` | Port 8080 is taken. `docker-compose.yml` binds HAPI to `127.0.0.1:8080`. | Stop the other listener, or run `npm run demo:local:down` if a previous stack holds the port, then re-run. |
| `waiting for FHIR server at http://localhost:8080/fhir ...` and then `FHIR server at http://localhost:8080/fhir not ready after 5 minutes.` | The first HAPI boot initializes its database. That wait is five minutes (`npm run fhir:wait`). | Leave the containers up and run `npm run fhir:wait`. If it times out again, read `docker compose logs hapi`, then `npm run demo:local:down` and re-run. |
| An old chart, a half-started stack, or compose errors about an existing container | A previous local stack is still present. | `npm run demo:local:down`, then `npm run demo:local` or `npm run mcp:demo`. |
| `npm warn EBADENGINE` with `required: { node: '^22.18.0 \|\| >=24.2.0' }` | Node is outside `package.json` `engines`. `.nvmrc` is `22.18.0`. Without `engine-strict`, npm warns and still installs. | Install Node 22.18+ or 24.2+, then run `npm install` again. |
| `Seeding needs write access to your Medplum project.` | `npm run seed` ran without `FHIR_BACKEND=hapi` and without Medplum credentials. `demo:local` sets the HAPI URL itself; a bare `npm run seed` does not. | With the stack up: `FHIR_BACKEND=hapi FHIR_BASE_URL=http://localhost:8080/fhir npm run seed`. Or use `npm run demo:local`. |
| `FHIR_BACKEND=hapi requires HAPI_BASE_URL or FHIR_BASE_URL (for example http://localhost:8080/fhir).` | HAPI mode is on and the base URL is unset. | `export FHIR_BASE_URL=http://localhost:8080/fhir` (or `HAPI_BASE_URL`) and re-run. |
| `Set MEDPLUM_ACCESS_TOKEN or MEDPLUM_CLIENT_ID plus MEDPLUM_CLIENT_SECRET before starting Last EHR MCP.` | `@lastehr/mcp` started in the default Medplum mode with no credential. | For this stack, set `FHIR_BACKEND=hapi` and `FHIR_BASE_URL=http://localhost:8080/fhir` instead of a Medplum token. |

## Medplum-backed demo

Use this path when you want real Medplum auth, AccessPolicy, and SMART launch
behavior.

Prerequisites:

- Node 22.18+ (or 24.2+)
- A Medplum project
- A Medplum ClientApplication with client credentials
- One tool-capable model key

```bash
git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
cp .env.example .env.local
npm run seed
npm run dev
```

At minimum set:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
NEXT_PUBLIC_QUICKSTART=true
OPENAI_API_KEY=...
```

If you self-host Medplum, also set:

```bash
MEDPLUM_BASE_URL=https://your-medplum.example/
NEXT_PUBLIC_MEDPLUM_BASE_URL=https://your-medplum.example/
```

## Model providers

`AI_PROVIDER=scripted` above is deliberately not a model provider. It is a
fixed local synthetic walkthrough. For a real agent, supported providers are
intentionally limited to BAA-capable paths:

| Provider | Env | Notes |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | Default provider. |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | Uses Anthropic models directly. |
| Amazon Bedrock | `AI_PROVIDER=bedrock`, `MODEL_ID`, AWS credential env | Requires an explicit model id or inference profile. |

The operator is responsible for signing the required BAA. A bare API key is not
PHI-ready.

## First prompts

In scripted mode, any submitted message starts the same fixed sequence. For a
real model-backed agent, try these in order:

```text
Find patients named Smith
Show me Maria Garcia's chart
Record a heart rate of 72 bpm for Maria Garcia
Add a note to Maria Garcia's chart that she reports feeling well with no complaints
```

The write prompts should stop at the approval card before anything is saved.

## Other synthetic-evaluation backends

Beyond Medplum and the local HAPI stack, three more adapters are verified
for synthetic evaluation: Firely Server (`FHIR_BACKEND=firely`, e.g. against
the public sandbox at `https://server.fire.ly`), Aidbox
(`FHIR_BACKEND=aidbox`, against a dev-licensed or hosted dev box), and
Oystehr (`FHIR_BACKEND=oystehr`, against a developer-tier project). Setup,
auth, and caveats for each are in the [adapter guide](./adapters.md); the
boundaries are in the [support matrix](./support.md). None is an
authenticated or PHI-ready path.
