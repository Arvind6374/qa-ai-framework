// src/config/global-teardown.js
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

async function globalTeardown() {
  logger.info("Running global teardown…");

  // Stamp end time onto session metadata
  const sessionPath = path.resolve("reports/session.json");
  if (fs.existsSync(sessionPath)) {
    const session = JSON.parse(fs.readFileSync(sessionPath, "utf-8"));
    session.endedAt = new Date().toISOString();
    session.durationMs = Date.now() - new Date(session.startedAt).getTime();
    fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  }

  logger.info("Global teardown complete ✓");
}

module.exports = globalTeardown;
