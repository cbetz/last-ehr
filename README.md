# Last EHR

[![CI](https://github.com/cbetz/last-ehr/actions/workflows/ci.yml/badge.svg)](https://github.com/cbetz/last-ehr/actions/workflows/ci.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**Open-source AI agent layer for Medplum & FHIR** — a permissioned AI agent over the patient chart. Bring your own backend and your own model key.

> **Last EHR is a _layer_, not an EHR.** It runs *on top of* a headless FHIR backend (Medplum today) and talks to it over the FHIR API. It is not the system of record, stores no PHI of its own, and never bundles or forks the backend.

**Status: early / alpha.** APIs, structure, and scope will change. Use synthetic data only. · License: [Apache-2.0](./LICENSE)

## What it does

- A chat agent (Vercel AI SDK) with FHIR tools — today: **search patients** and **view a patient chart** — streamed and rendered as rich cards.
- Authentication, multi-tenancy, and access control are delegated to your **Medplum** project (`Project` = tenant, `ProjectMembership` = user, `AccessPolicy` = RBAC). Last EHR doesn't reimplement any of that.

## What it isn't

- Not a charting EHR, not a system of record, not a Medplum replacement, and not (yet) a write-capable clinical tool — the shipped tools are read-only.

## How it works

Next.js 15 (App Router) + React 19. The agent lives in `app/api/chat/route.ts` (`streamText` + FHIR tools); the FHIR calls go through `@medplum/core` against the Medplum instance you configure. **Backend-agnostic is the goal** — Medplum is the first adapter; the FHIR calls are the seam where other headless EHRs (Aidbox, HAPI, Firely, …) would slot in.

## Quickstart

Prerequisites: Node ≥ 20.9, a **Medplum** project (Medplum-hosted [free tier](https://app.medplum.com/) or your own), and one model API key (OpenAI or Anthropic).

```bash
git clone https://github.com/cbetz/last-ehr.git
cd last-ehr
npm install
cp .env.example .env.local      # then edit .env.local (see below)
npm run seed                     # load synthetic patients into your Medplum
npm run dev                      # http://localhost:3000/demo
```

At minimum set, in `.env.local`:

- a model key — `OPENAI_API_KEY` (default provider) **or** `ANTHROPIC_API_KEY` with `AI_PROVIDER=anthropic`;
- `NEXT_PUBLIC_MEDPLUM_BASE_URL` / `MEDPLUM_BASE_URL` if you're pointing at your own Medplum (leave blank to use Medplum's hosted API);
- `MEDPLUM_CLIENT_ID` + `MEDPLUM_CLIENT_SECRET` (a Medplum [ClientApplication](https://www.medplum.com/docs/auth/methods/client-credentials)) — used by `npm run seed`, and by the **no-sign-in quickstart** when you also set `NEXT_PUBLIC_QUICKSTART=true`. Or set `NEXT_PUBLIC_MEDPLUM_GOOGLE_CLIENT_ID` to sign in via Medplum's Google OAuth instead.

`npm run seed` loads a small **synthetic** patient set (`scripts/fixtures/synthetic-patients.json` — a few patients with conditions and observations, two named "Smith"). Then open `/demo` and ask: *"find patients named Smith."* Use synthetic data only.

## Configuration

Every variable is documented in [`.env.example`](./.env.example). The model is provider-agnostic: set `AI_PROVIDER` (`openai` | `anthropic`), optionally `MODEL_ID`, and the matching key. Analytics (PostHog) and the marketing-site waitlist (Neon) are optional and lastehr.com-specific.

## Security & data

PHI flows to whichever model provider you configure, under **your** API key — so use a provider and agreement appropriate for your data. This project is alpha and is **not** a HIPAA-covered service; PHI handling is the operator's responsibility. Use synthetic data unless you have the right agreements in place. See [SECURITY.md](./SECURITY.md).

## Open-core

Self-hosting is free and Apache-2.0. A managed hosted tier (managed Medplum + a signed BAA, multi-tenancy, billing) may follow — built only after the open-source core has traction.

## Not affiliated

A personal open-source project. Not affiliated with, endorsed by, or sponsored by Medplum, Vercel, or any employer.

## License

[Apache-2.0](./LICENSE). See [NOTICE](./NOTICE) for third-party attributions and [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute.
