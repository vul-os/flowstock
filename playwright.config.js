import { defineConfig, devices } from "@playwright/test";

/**
 * FlowStock end-to-end tests.
 *
 * Every spec boots the real Go binary against a throwaway data dir, so there is
 * no global `webServer` here — servers are per-test fixtures (see
 * e2e/helpers/node.js). That is what makes the two-node sync spec possible.
 *
 * The viewport is desktop-width on purpose: the top bar hides its "Sync now"
 * label below the `sm` breakpoint, and the mobile drawer mounts a second copy
 * of the sidebar, which makes nav links strict-mode ambiguous.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Each test navigates to its own node's origin, so no global baseURL.
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
