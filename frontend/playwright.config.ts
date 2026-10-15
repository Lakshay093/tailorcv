import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const backend = path.resolve(__dirname, "../backend");
const python = process.env.E2E_PYTHON || (process.platform === "win32" ? path.join(backend, ".venv/Scripts/python.exe") : path.join(backend, ".venv/bin/python"));

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", acceptDownloads: true },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } } }, { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }],
  webServer: [
    { command: `"${python}" -m uvicorn tests.mock_server:app --host 127.0.0.1 --port 8001 --no-access-log`, cwd: backend, url: "http://127.0.0.1:8001/health", reuseExistingServer: false, timeout: 60000, env: { ALLOWED_ORIGINS: "http://127.0.0.1:3000", RATE_LIMIT_PER_MINUTE: "100" } },
    { command: `"${process.execPath}" node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`, url: "http://127.0.0.1:3000", reuseExistingServer: false, timeout: 120000, env: { NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8001" } },
  ],
});
