import { defineConfig, devices } from "@playwright/test";

// UI-only pilot tests: every spec drives the app the way a person would (typing, clicking, reading the screen).
// Run against a production build so many workers don't trip over dev-mode compiles:
//   NEXT_DIST_DIR=.next-build pnpm build && NEXT_DIST_DIR=.next-build npx next start --port 3150
//   npx playwright test
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3150",
    // The clinic's zone: schedules and "today" read in Manila time.
    timezoneId: "Asia/Manila",
    locale: "en-PH",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /\.mobile\.spec\.ts$/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /\.mobile\.spec\.ts$/ },
  ],
});
