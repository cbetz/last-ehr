import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "work-e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/work" }]],
  use: { baseURL: "http://127.0.0.1:3301", trace: "retain-on-failure" },
  webServer: {
    command: "npm run work:demo -- --port 3301 --store .lastehr/work-lab-e2e/work.sqlite",
    url: "http://127.0.0.1:3301/health",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      LASTEHR_WORK_ASSISTANT_KEY: "assistant-browser-test-00000000000000000000",
      LASTEHR_WORK_REVIEWER_KEY: "reviewer-browser-test-000000000000000000000",
    },
  },
});
