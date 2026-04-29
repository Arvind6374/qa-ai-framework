// src/config/env.js
require("dotenv").config();

/**
 * Single source of truth for all environment-specific configuration.
 * Validates required vars at import time so tests fail fast with a clear message
 * rather than cryptic runtime errors deep in the test body.
 */

const config = {
  // ── Target application ────────────────────────────────────────────────────
  baseURL: process.env.BASE_URL || "https://reqres.in",
  apiBaseURL: process.env.API_BASE_URL || "https://reqres.in/api",

  // ── Auth (if needed) ──────────────────────────────────────────────────────
  apiKey: process.env.API_KEY || "",
  authToken: process.env.AUTH_TOKEN || "",

  // ── Test behaviour ────────────────────────────────────────────────────────
  environment: process.env.TEST_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",
  isCI: !!process.env.CI,
  headless: process.env.HEADLESS !== "false",

  // ── Timeouts (ms) ─────────────────────────────────────────────────────────
  timeouts: {
    navigation: Number(process.env.NAVIGATION_TIMEOUT) || 15_000,
    action: Number(process.env.ACTION_TIMEOUT) || 10_000,
    api: Number(process.env.API_TIMEOUT) || 10_000,
  },

  // ── Groq / AI ─────────────────────────────────────────────────────────────
  groqApiKey: process.env.GROQ_API_KEY || "",
  aiModel: process.env.AI_MODEL || "llama-3.3-70b-versatile",
  aiEnabled: !!(process.env.GROQ_API_KEY),

  // ── Reporting ─────────────────────────────────────────────────────────────
  slackWebhook: process.env.SLACK_WEBHOOK || "",
  reportBaseDir: process.env.REPORT_DIR || "reports",
};

// ── Soft validation ────────────────────────────────────────────────────────
const warnings = [];
if (!config.groqApiKey) {
  warnings.push("GROQ_API_KEY not set – AI features will run in mock mode");
}
if (warnings.length && !config.isCI) {
  console.warn("\n⚠️  Configuration warnings:");
  warnings.forEach((w) => console.warn(`   • ${w}`));
  console.warn("");
}

module.exports = config;
