import { defineConfig } from "@playwright/test";

// The exact zero-external-service environment CI's local-hapi job uses: a
// scripted (non-LLM) model, quickstart cookies, and a local HAPI backend.
// The worktree has no .env.local, so this block fully controls the build;
// NEXT_PUBLIC_* values must be here because they are inlined at build time.
const scriptedDemoEnv = {
  FHIR_BACKEND: "hapi",
  FHIR_BASE_URL: "http://localhost:8080/fhir",
  AI_PROVIDER: "scripted",
  LASTEHR_SCRIPTED_DEMO: "true",
  NEXT_PUBLIC_QUICKSTART: "true",
  NEXT_PUBLIC_SCRIPTED_DEMO: "true",
  // Each test re-arms the quickstart session before every send and approval,
  // so the default 10/min in-memory limit trips from one localhost IP.
  RATE_LIMIT_PER_IP_MAX: "100",
  // Keep every optional external service off, matching CI.
  NEXT_PUBLIC_POSTHOG_KEY: "",
  NEXT_PUBLIC_POSTHOG_HOST: "",
  NEXT_PUBLIC_MEDPLUM_BASE_URL: "",
  MEDPLUM_BASE_URL: "",
  MEDPLUM_CLIENT_ID: "",
  MEDPLUM_CLIENT_SECRET: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
};

export default defineConfig({
  testDir: "e2e",
  // Vitest owns *.test.ts / *.spec.ts; Playwright files are *.e2e.ts.
  testMatch: "**/*.e2e.ts",
  // Tests share one HAPI server; serial execution keeps runs deterministic.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Always write the HTML report so CI's failure-artifact upload has content;
  // the CI default reporter is dot, which writes nothing to playwright-report/.
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    // No retries, so retain-on-failure keeps a trace for every failed test.
    trace: "retain-on-failure",
  },
  webServer: {
    // Port 3100 so a dev server on 3000 can keep running.
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100/demo",
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: scriptedDemoEnv,
  },
});
