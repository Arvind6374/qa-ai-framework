// tests/fixtures/api.fixture.js
const { test: base } = require("@playwright/test");
const ApiClient = require("../../src/utils/api-client");
const { DataFactory } = require("../../src/utils/data-factory");
const env = require("../../src/config/env");
const logger = require("../../src/utils/logger");

/**
 * Extended Playwright fixtures providing:
 *  - `api`     – configured ApiClient instance
 *  - `factory` – per-test DataFactory with unique seed (reproducible per test name)
 *  - `log`     – test-scoped logger child
 *
 * Fixtures auto-cleanup: no state leaks between tests.
 */
const test = base.extend({
  api: async ({}, use) => {
    const client = new ApiClient(env.apiBaseURL, {
      timeout: env.timeouts.api,
      headers: env.apiKey ? { Authorization: `Bearer ${env.apiKey}` } : {},
    });
    await use(client);
  },

  factory: async ({}, use, testInfo) => {
    // Seed from test title hash → same test always gets same data
    const seed = testInfo.title
      .split("")
      .reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const factory = new DataFactory(seed);
    await use(factory);
  },

  log: async ({}, use, testInfo) => {
    const log = logger.forTest(testInfo.title);
    log.info(`Test started: ${testInfo.title}`);
    await use(log);
    log.info(`Test finished: ${testInfo.status}`);
  },
});

const expect = base.expect;
module.exports = { test, expect };
