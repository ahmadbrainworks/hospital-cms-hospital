import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration.
 *
 * Requires the following services running:
 *   - API:       http://localhost:4000  (apps/api)
 *   - Web:       http://localhost:3000  (apps/web, includes /install)
 *
 * Set SKIP_INSTALL=1 to skip installer tests when the DB is already seeded.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // run sequentially — tests share DB state
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
