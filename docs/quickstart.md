# Quickstart

The fastest way to understand Last EHR is the hosted demo:

<https://www.lastehr.com/demo>

It uses synthetic patients, needs no account, and every write stops at an
approval card.

## Fully local demo with HAPI FHIR

Use this path when you want to evaluate without a Medplum account.

Prerequisites:

- Node 20.9 or newer
- Docker
- One tool-capable model key from a supported provider

Create `.env.local`:

```bash
FHIR_BACKEND=hapi
FHIR_BASE_URL=http://localhost:8080/fhir
NEXT_PUBLIC_QUICKSTART=true
OPENAI_API_KEY=...
```

Then run:

```bash
docker compose up -d
npm run fhir:wait
npm install
npm run seed
npm run dev
```

Open <http://localhost:3000/demo>.

The local HAPI server has no auth. Use it for local, single-tenant synthetic
evaluation only.

To run the app itself in Docker too:

```bash
npm run docker:local
```

This uses `docker-compose.yml` plus `docker-compose.app.yml`.

## Medplum-backed demo

Use this path when you want real Medplum auth, AccessPolicy, and SMART launch
behavior.

Prerequisites:

- Node 20.9 or newer
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

Supported providers are intentionally limited to BAA-capable paths:

| Provider | Env | Notes |
| --- | --- | --- |
| OpenAI | `OPENAI_API_KEY` | Default provider. |
| Anthropic | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` | Uses Anthropic models directly. |
| Amazon Bedrock | `AI_PROVIDER=bedrock`, `MODEL_ID`, AWS credential env | Requires an explicit model id or inference profile. |

The operator is responsible for signing the required BAA. A bare API key is not
PHI-ready.

## First prompts

Try these in order:

```text
Find patients named Smith
Show me Maria Garcia's chart
Record a heart rate of 72 bpm for Maria Garcia
Add a note to Maria Garcia's chart that she reports feeling well with no complaints
```

The write prompts should stop at the approval card before anything is saved.
