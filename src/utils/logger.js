// src/utils/logger.js
const winston = require("winston");
const path = require("path");
const dayjs = require("dayjs");

const LOG_DIR = path.resolve(__dirname, "../../reports");

/**
 * Structured logger shared across the entire framework.
 * - Console: colourised, human-readable
 * - File (combined.log): JSON for machine parsing / AI analysis
 * - File (error.log):    errors only, for rapid triage
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: { service: "qa-ai-framework" },

  format: winston.format.combine(
    winston.format.timestamp({ format: () => dayjs().format("YYYY-MM-DD HH:mm:ss") }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),

  transports: [
    // ── Console ──────────────────────────────────────────────────────────────
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
          return `${timestamp} [${level}] ${message}${extras}`;
        })
      ),
    }),

    // ── JSON log (AI analysis feed) ──────────────────────────────────────────
    new winston.transports.File({
      filename: path.join(LOG_DIR, "combined.log"),
      maxsize: 5_242_880, // 5 MB
      maxFiles: 5,
    }),

    // ── Errors only ──────────────────────────────────────────────────────────
    new winston.transports.File({
      level: "error",
      filename: path.join(LOG_DIR, "error.log"),
    }),
  ],
});

// Convenience child-loggers for different subsystems
logger.forTest = (testName) => logger.child({ testName });
logger.forAI = () => logger.child({ subsystem: "ai-engine" });
logger.forAPI = () => logger.child({ subsystem: "api-client" });

module.exports = logger;
