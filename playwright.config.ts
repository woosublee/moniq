import { defineConfig } from "@playwright/test";

/** Synthetic UI only. No real database, credentials, account signup or saved mutations. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  // Each run keeps earlier screenshots/traces intact. --output can name a specific run.
  outputDir: `.superpowers/sdd/quirky-dreaming-quiche/browser-${Date.now()}`,
  reporter: "list",
  use: { baseURL: "http://localhost:3106", browserName: "chromium", channel: "chrome", trace: "retain-on-failure" },
  webServer: {
    command: `node scripts/task6-preview.mjs${process.env.TASK7_HARNESS === "1" ? " --task7-harness" : ""}`,
    url: "http://localhost:3106/demo",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
