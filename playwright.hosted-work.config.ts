import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "work-e2e", testMatch: "hosted-work.e2e.ts", workers: 1, timeout: 60_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report/hosted-work" }]],
  use: { trace: "retain-on-failure" },
});
