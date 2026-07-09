# Deployment

Last EHR can run as a normal Next.js application. The public demo is deployed
on Vercel, but the app is not Vercel-specific.

## Required runtime inputs

You need:

- A FHIR backend.
- A model provider key or provider credentials.
- A session/auth mode.

For local HAPI quickstart:

```bash
FHIR_BACKEND=hapi
FHIR_BASE_URL=http://localhost:8080/fhir
NEXT_PUBLIC_QUICKSTART=true
OPENAI_API_KEY=...
```

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

For a full local stack with the app, HAPI FHIR, and Postgres, copy
`.env.example` to `.env.local`, fill in a model key, and run:

```bash
docker compose -f docker-compose.yml -f docker-compose.app.yml up --build
```

Then seed from the host:

```bash
npm install
npm run fhir:wait
npm run seed
```

Open <http://localhost:3000/demo>.

`NEXT_PUBLIC_*` values are build-time values in Next.js. The provided compose
override passes `NEXT_PUBLIC_QUICKSTART=true` as a build arg for the local HAPI
demo. Rebuild the image if you change public env vars.

## PHI posture

Do not deploy against real PHI unless you have:

- A BAA with the model provider that covers API traffic.
- A HIPAA-eligible FHIR backend with its own BAA.
- Your own security and compliance review.

Last EHR is alpha and is not a HIPAA-covered service.
