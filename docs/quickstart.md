# Quickstart

The fastest way to understand Last EHR is the hosted demo:

<https://www.lastehr.com/demo>

It uses synthetic patients, needs no account, and every write stops at an
approval card.

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
support or a substitute for the published Medplum-only `@lastehr/mcp` package.
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

Public `NEXT_PUBLIC_*` values are read at startup. The real agent can use all
four tools and requires a tool-capable model credential.

To run the app itself in Docker too:

```bash
npm run docker:local
```

This uses `docker-compose.yml` plus `docker-compose.app.yml` and reads the
build-time public values from `.env.local`.

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
