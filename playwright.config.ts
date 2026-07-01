import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Load .env.local so TEST_DATABASE_URL (+ AUTH secrets) are available here and
// inherited by the seed step and the dev server we spawn.
loadEnvConfig(process.cwd());

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The suite shares one seeded DB, so run serially for determinism.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Default identity is the workspace admin; specs override per role.
    storageState: "tests/e2e/.auth/admin.json",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      use: { storageState: { cookies: [], origins: [] } },
    },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    // Point the dev server at the throwaway test DB (overrides .env.local) and
    // disable real email sending (invite/OTP flows fall back to console).
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL || "",
      RESEND_API_KEY: "",
      SMTP_HOST: "",
    },
  },
});
