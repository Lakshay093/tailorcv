import { defineConfig, devices } from "@playwright/test";

if (!process.env.LIVE_APP_URL?.startsWith("https://")) {
  throw new Error("Set LIVE_APP_URL to the deployed HTTPS frontend URL.");
}

export default defineConfig({
  testDir: "./live-tests",
  workers: 1,
  timeout: 300000,
  expect: { timeout: 180000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.LIVE_APP_URL,
    viewport: { width: 1440, height: 1100 },
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
