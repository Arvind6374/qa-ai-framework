// src/reporters/ai-reporter.js
/**
 * AI-Reporter – custom Playwright reporter
 * ════════════════════════════════════════
 * Plugs into the Playwright reporter API to:
 *   • Stream test results to a structured in-memory store
 *   • After the run, trigger FailureAnalyzer for AI triage
 *   • Write a machine-readable events log (for analytics)
 *   • Print a rich CLI summary with colour and failure grouping
 */

const fs = require("fs");
const path = require("path");

// Inline ANSI colours (avoid chalk dep in reporter context)
const c = {
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
};

class AIReporter {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
    this.events = [];
  }

  // ── Playwright Reporter Hooks ──────────────────────────────────────────────
  onBegin(config, suite) {
    const total = suite.allTests().length;
    console.log(
      c.bold(`\n🤖  QA-AI Framework | ${total} tests | ${config.workers} workers\n`)
    );
    this._event("suite_start", { total, workers: config.workers });
  }

  onTestBegin(test) {
    this._event("test_start", { title: test.title });
  }

  onTestEnd(test, result) {
    const status = result.status;
    const icon =
      status === "passed" ? c.green("✓") : status === "skipped" ? c.yellow("○") : c.red("✗");
    const duration = c.dim(`${result.duration}ms`);
    const titleParts = test.titlePath().slice(1); // skip root
    const label = titleParts.join(" › ");

    if (status !== "passed") {
      const errMsg = result.errors?.[0]?.message?.split("\n")[0] || "";
      console.log(`  ${icon} ${label} ${duration}`);
      if (errMsg) console.log(`      ${c.red(errMsg.slice(0, 100))}`);
    }

    this.results.push({
      title: test.title,
      fullTitle: label,
      file: test.location?.file,
      status,
      duration: result.duration,
      error: result.errors?.[0]?.message,
      retries: result.retry,
    });

    this._event("test_end", { title: test.title, status, duration: result.duration });
  }

  onEnd(result) {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const total = this.results.length;
    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;

    console.log("\n" + "─".repeat(60));
    console.log(c.bold("  RESULTS"));
    console.log("─".repeat(60));
    console.log(`  ${c.green("Passed:")}  ${passed}`);
    if (failed) console.log(`  ${c.red("Failed:")}  ${failed}`);
    if (skipped) console.log(`  ${c.yellow("Skipped:")} ${skipped}`);
    console.log(`  Total:    ${total} in ${duration}s`);
    console.log("─".repeat(60));

    // Print failure titles
    const failures = this.results.filter((r) => r.status === "failed");
    if (failures.length) {
      console.log(c.red("\n  Failed tests:"));
      failures.forEach((f) =>
        console.log(`    ${c.red("•")} ${f.fullTitle}`)
      );
    }

    // Trigger AI analysis if failures exist
    if (failures.length > 0) {
      console.log(c.cyan("\n  ℹ  Run `npm run analyze:failures` for AI root-cause analysis\n"));
    }

    // Write events log
    this._event("suite_end", { passed, failed, skipped, duration });
    this._flushEvents();

    console.log(
      c.dim(`  Reports: reports/html/index.html | reports/results.json\n`)
    );
  }

  // ── Event store ───────────────────────────────────────────────────────────
  _event(type, data) {
    this.events.push({ type, ts: Date.now(), ...data });
  }

  _flushEvents() {
    try {
      fs.mkdirSync("reports", { recursive: true });
      fs.writeFileSync(
        path.resolve("reports/events.jsonl"),
        this.events.map((e) => JSON.stringify(e)).join("\n")
      );
    } catch (_) {
      // Non-fatal
    }
  }
}

module.exports = AIReporter;
