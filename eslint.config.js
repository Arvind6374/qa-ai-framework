// eslint.config.js
const globals = require("globals");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  // ── Global ignores ──────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/",
      "reports/",
      "test-results/",
      "playwright-report/",
      ".cache/",
    ],
  },

  // ── Source files ────────────────────────────────────────────────────────
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off", // logging is intentional in this framework
      "no-undef": "error",
      "prefer-const": "warn",
      "no-var": "warn",
      eqeqeq: ["warn", "always"],
    },
  },

  // ── Test files ─────────────────────────────────────────────────────────
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
      "no-undef": "off", // Playwright injects globals
      "prefer-const": "warn",
      "no-var": "warn",
    },
  },
];
