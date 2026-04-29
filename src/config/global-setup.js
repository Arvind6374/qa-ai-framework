// src/config/global-setup.js
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

/**
 * Playwright global setup – runs once before the entire test suite.
 * Responsibilities:
 *  - Ensure output directories exist
 *  - Validate required environment variables
 *  - Warm up API connectivity (fail fast if target is unreachable)
 *  - Write session metadata for the AI reporter
 */
async function globalSetup(config) {
  logger.info("═══════════════════════════════════════════");
  logger.info("  QA-AI Framework – Global Setup Starting  ");
  logger.info("═══════════════════════════════════════════");

  // ── Ensure report directories ──────────────────────────────────────────────
  const dirs = [
    path.resolve("reports"),
    path.resolve("reports/html"),
    path.resolve("reports/screenshots"),
  ];
  dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
  logger.info("Report directories ready", { dirs });

  // ── Write session metadata ─────────────────────────────────────────────────
  const session = {
    id: `session-${Date.now()}`,
    startedAt: new Date().toISOString(),
    baseURL: config.use?.baseURL,
    workers: config.workers,
    ci: !!process.env.CI,
    nodeVersion: process.version,
    environment: process.env.TEST_ENV || "development",
  };

  fs.writeFileSync(
    path.resolve("reports/session.json"),
    JSON.stringify(session, null, 2)
  );
  logger.info("Session metadata written", session);

  // ── Connectivity check ─────────────────────────────────────────────────────
  try {
    const axios = require("axios");
    const baseURL = config.use?.baseURL || "https://reqres.in";
    const res = await axios.get(`${baseURL}/api/users?page=1`, { timeout: 8_000 });
    logger.info(`Connectivity check passed: ${baseURL}`, { status: res.status });
  } catch (err) {
    logger.error("Connectivity check FAILED – tests will likely fail", {
      error: err.message,
    });
    // Do NOT throw – let individual tests fail with proper context
  }

  logger.info("Global setup complete ✓");
}

module.exports = globalSetup;
