// playwright.config.js
// @ts-check
const { defineConfig, devices } = require("@playwright/test");
require("dotenv").config();

/**
 * QA-AI Framework – Playwright Configuration
 *
 * Design decisions:
 * - Chromium primary for speed; Firefox + Safari in CI for cross-browser coverage
 * - Workers capped at 4 locally, 2 in CI to avoid flakiness on shared runners
 * - Custom reporter pipeline: JSON (for AI analysis) + HTML (human-readable)
 * - Global setup/teardown to seed/clean test data before/after the full suite
 */
module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: [
    ["list"],
    ["json", { outputFile: "reports/results.json" }],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["./src/reporters/ai-reporter.js"],
  ],

  use: {
    baseURL: process.env.BASE_URL || "https://reqres.in",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    extraHTTPHeaders: {
      "x-qa-framework": "qa-ai-framework/1.0.0",
    },
  },

  projects: [
    // ── Functional Smoke ─────────────────────────────────────────────────────
    {
      name: "chromium-smoke",
      use: { ...devices["Desktop Chrome"] },
      testMatch: ["**/smoke/**/*.spec.js", "**/api/**/*.spec.js"],
      grep: /@smoke/,
    },

    // ── Full UI Suite ────────────────────────────────────────────────────────
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/ui/**/*.spec.js",
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: "**/ui/**/*.spec.js",
    },

    // ── API Suite (browser-less, fast) ───────────────────────────────────────
    {
      name: "api",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "**/api/**/*.spec.js",
    },

    // ── Mobile Viewport ──────────────────────────────────────────────────────
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: "**/ui/**/*.spec.js",
    },
  ],

  globalSetup: "./src/config/global-setup.js",
  globalTeardown: "./src/config/global-teardown.js",
});
