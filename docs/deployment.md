# Deployment

Last EHR can run as a normal Next.js application. The public demo is deployed
on Vercel, but the app is not Vercel-specific.

## Required runtime inputs

You need:

- A FHIR backend.
- A model provider key or provider credentials for a real agent; the explicit
  local scripted HAPI walkthrough is the only zero-key exception.
- A session/auth mode.

For local HAPI quickstart:

```bash
FHIR_BACKEND=hapi
FHIR_BASE_URL=http://localhost:8080/fhir
NEXT_PUBLIC_QUICKSTART=true
AI_PROVIDER=scripted
LASTEHR_SCRIPTED_DEMO=true
NEXT_PUBLIC_SCRIPTED_DEMO=true
```

This mode is fixed and synthetic-only: it makes no model-provider request,
searches only the seeded Maria Garcia record, and can write only the fixed 72
bpm observation after approval. To run a real agent against local HAPI, remove
the scripted flags and configure an external provider key instead.

For Medplum quickstart:

```bash
MEDPLUM_CLIENT_ID=...
MEDPLUM_CLIENT_SECRET=...
NEXT_PUBLIC_QUICKSTART=true
OPENAI_API_KEY=...
```

For SMART launch:

```bash
SMART_CLIENT_ID=...
```

## Public demo hardening

For a public deployment, set a shared rate-limit store:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

or the Vercel Marketplace KV env vars:

```bash
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

Without Redis/KV, the app falls back to an in-memory limiter, which is fine for
local development but not reliable across serverless instances.

## Docker

The repository includes a Dockerfile for app packaging and compose files for
local evaluation. Build the app image with:

```bash
docker build -t lastehr .
```

For the fastest zero-key developer walkthrough, use the host app instead of
the app container after `npm install`:

```bash
npm run demo:local
```

It starts the HAPI/Postgres stack, waits, seeds, and launches Next.js with the
fixed scripted configuration. It does not require or mutate `.env.local`; use
`npm run demo:local:down` to remove the local stack afterward.

For a full local stack with the app, HAPI FHIR, and Postgres, copy
`.env.example` to `.env.local` and set the zero-key scripted local backend:

```bash
FHIR_BACKEND=hapi
FHIR_BASE_URL=http://localhost:8080/fhir
NEXT_PUBLIC_QUICKSTART=true
AI_PROVIDER=scripted
LASTEHR_SCRIPTED_DEMO=true
NEXT_PUBLIC_SCRIPTED_DEMO=true
```

Then run:

```bash
npm run docker:local
```

Then seed from the host (the host process needs the same HAPI values above so
it does not fall back to Medplum):

```bash
npm install
npm run fhir:wait
npm run seed
```

Open <http://localhost:3000/demo>.

`NEXT_PUBLIC_*` values are build-time values in Next.js. `npm run docker:local`
passes `.env.local` to Compose so it can forward `NEXT_PUBLIC_QUICKSTART` and
`NEXT_PUBLIC_SCRIPTED_DEMO` as build args. Rebuild the image if you change
public env vars.

## PHI posture

Do not deploy against real PHI unless you have:

- A BAA with the model provider that covers API traffic.
- A HIPAA-eligible FHIR backend with its own BAA.
- Your own security and compliance review.

Last EHR is alpha and is not a HIPAA-covered service.
