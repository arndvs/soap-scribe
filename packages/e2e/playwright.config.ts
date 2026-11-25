import { defineConfig } from "@playwright/test";

/**
 * End-to-end: the built extension in Chromium, against demo mode (real API, worker and
 * pipeline; fake Pocket, fake Jane, rule-based stand-in model). See docs/demo.md.
 */
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  webServer: {
    command: "pnpm --filter @soap-scribe/extension build:demo && pnpm --filter @soap-scribe/server demo",
    url: "http://localhost:4100/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
  },
});
