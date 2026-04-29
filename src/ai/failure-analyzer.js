// src/ai/failure-analyzer.js
/**
 * AI Failure Analyzer
 * ═══════════════════
 * The core AI component of the framework. After a test run, this module:
 *
 *  1. Reads the Playwright JSON results report
 *  2. Extracts failures with their stack traces, error messages, and context
 *  3. Sends them to Groq LLM for root-cause analysis
 *  4. Groups failures by suspected root cause (de-duplicates noise)
 *  5. Writes a structured analysis report that accelerates triage
 *
 * Why this solves a real problem:
 *  A 200-test suite failing 12 tests can produce 12 nearly-identical stack
 *  traces that all stem from a single broken API endpoint. Without grouping,
 *  engineers investigate the same root cause 12 times. With AI analysis,
 *  those 12 failures collapse into 1 actionable finding.
 *
 * Mock mode: when GROQ_API_KEY is absent, returns deterministic heuristic
 *            analysis so the framework works out-of-the-box without credentials.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const env = require("../config/env");

const aiLog = logger.forAI();

// ── Types / shapes (JSDoc for editor support) ──────────────────────────────
/**
 * @typedef {Object} FailureContext
 * @property {string} testName
 * @property {string} suiteName
 * @property {string} errorMessage
 * @property {string} stackTrace
 * @property {number} duration
 * @property {string[]} retries
 * @property {Object} annotations
 */

/**
 * @typedef {Object} AnalysisResult
 * @property {string} rootCause
 * @property {string} category
 * @property {string} suggestedFix
 * @property {string} severity
 * @property {string[]} affectedTests
 * @property {number} confidence
 */

// ── Failure categories (heuristics + AI confirmation) ─────────────────────
const FAILURE_CATEGORIES = {
  NETWORK: "network-connectivity",
  TIMEOUT: "timeout",
  SELECTOR: "ui-selector",
  ASSERTION: "assertion-mismatch",
  AUTH: "authentication",
  DATA: "test-data",
  ENVIRONMENT: "environment",
  RACE_CONDITION: "race-condition",
  UNKNOWN: "unknown",
};

class FailureAnalyzer {
  constructor() {
    this.resultsPath = path.resolve("reports/results.json");
    this.outputPath = path.resolve("reports/ai-analysis.json");
    this.aiEnabled = env.aiEnabled;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async analyze() {
    aiLog.info("Starting AI failure analysis…");

    const results = this._loadResults();
    if (!results) return null;

    const failures = this._extractFailures(results);
    aiLog.info(`Found ${failures.length} failures to analyze`);

    if (failures.length === 0) {
      aiLog.info("No failures detected – analysis complete ✓");
      return { summary: "All tests passed", groups: [], totalFailures: 0 };
    }

    const groups = await this._groupAndAnalyze(failures);
    const report = this._buildReport(groups, results, failures);

    fs.writeFileSync(this.outputPath, JSON.stringify(report, null, 2));
    aiLog.info(`Analysis saved to ${this.outputPath}`);
    this._printSummary(report);

    return report;
  }

  // ── Results loading ────────────────────────────────────────────────────────
  _loadResults() {
    if (!fs.existsSync(this.resultsPath)) {
      aiLog.error(`Results file not found: ${this.resultsPath}`);
      aiLog.info("Run tests first: npm test");
      return null;
    }
    try {
      return JSON.parse(fs.readFileSync(this.resultsPath, "utf-8"));
    } catch (err) {
      aiLog.error("Failed to parse results JSON", { error: err.message });
      return null;
    }
  }

  // ── Extract failures from Playwright JSON ──────────────────────────────────
  _extractFailures(results) {
    const failures = [];

    for (const suite of results.suites || []) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const failedResult = test.results?.find(
            (r) => r.status === "failed" || r.status === "timedOut"
          );
          if (!failedResult) continue;

          const errorInfo = failedResult.errors?.[0] || {};
          failures.push({
            testName: spec.title,
            suiteName: suite.title,
            file: spec.file,
            errorMessage: errorInfo.message || "Unknown error",
            stackTrace: errorInfo.stack || "",
            duration: failedResult.duration,
            retries: test.results?.length - 1,
            status: failedResult.status,
            category: this._heuristicCategory(
              errorInfo.message || "",
              errorInfo.stack || ""
            ),
          });
        }
      }
    }

    return failures;
  }

  // ── Fast heuristic categorization (runs before AI) ────────────────────────
  _heuristicCategory(message, stack) {
    const combined = `${message} ${stack}`.toLowerCase();

    if (/timeout|timed out|navigation timeout/.test(combined))
      return FAILURE_CATEGORIES.TIMEOUT;
    if (/econnrefused|enotfound|network|fetch failed|net::err/.test(combined))
      return FAILURE_CATEGORIES.NETWORK;
    if (/locator|selector|element.*not found|waiting for.*selector/.test(combined))
      return FAILURE_CATEGORIES.SELECTOR;
    if (/401|403|unauthorized|forbidden|token/.test(combined))
      return FAILURE_CATEGORIES.AUTH;
    if (/expect.*received|assert|toBe|toEqual|toHave/.test(combined))
      return FAILURE_CATEGORIES.ASSERTION;
    if (/race|concurrent|flak/.test(combined))
      return FAILURE_CATEGORIES.RACE_CONDITION;

    return FAILURE_CATEGORIES.UNKNOWN;
  }

  // ── Group + AI analysis ───────────────────────────────────────────────────
  async _groupAndAnalyze(failures) {
    // Pre-group by heuristic category (reduces AI tokens needed)
    const byCategory = {};
    for (const f of failures) {
      const cat = f.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(f);
    }

    const groups = [];

    for (const [category, categoryFailures] of Object.entries(byCategory)) {
      aiLog.info(`Analyzing ${categoryFailures.length} '${category}' failures…`);

      const analysis = this.aiEnabled
        ? await this._aiAnalyze(category, categoryFailures)
        : this._mockAnalyze(category, categoryFailures);

      groups.push({
        category,
        count: categoryFailures.length,
        tests: categoryFailures.map((f) => f.testName),
        analysis,
      });
    }

    return groups;
  }

  // ── Groq API call ─────────────────────────────────────────────────────────
  async _aiAnalyze(category, failures) {
    const prompt = this._buildPrompt(category, failures);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.groqApiKey}`,
        },
        body: JSON.stringify({
          model: env.aiModel,
          max_tokens: 1024,
          messages: [
            {
              role: "system",
              content: `You are a senior QA engineer specializing in test failure analysis. 
You produce concise, actionable diagnoses. Always respond with valid JSON only, 
no markdown fences, no preamble.`,
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "{}";
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (err) {
      aiLog.error("AI analysis failed, falling back to heuristic", {
        error: err.message,
      });
      return this._mockAnalyze(category, failures);
    }
  }

  // ── Mock analysis (no API key needed) ────────────────────────────────────
  _mockAnalyze(category, failures) {
    const templates = {
      [FAILURE_CATEGORIES.TIMEOUT]: {
        rootCause: "Request/navigation timeouts suggest the target server is slow or overloaded",
        suggestedFix: "1. Check server health metrics. 2. Increase timeout thresholds. 3. Add retry logic for transient failures.",
        severity: "high",
        confidence: 0.75,
      },
      [FAILURE_CATEGORIES.NETWORK]: {
        rootCause: "Network connectivity failures – target host unreachable or DNS resolution failed",
        suggestedFix: "1. Verify BASE_URL env var. 2. Check network connectivity in CI runner. 3. Confirm target service is deployed.",
        severity: "critical",
        confidence: 0.9,
      },
      [FAILURE_CATEGORIES.SELECTOR]: {
        rootCause: "UI element locator failures – selectors no longer match DOM structure",
        suggestedFix: "1. Inspect current DOM for element. 2. Prefer data-testid attributes. 3. Update selectors to match new UI.",
        severity: "medium",
        confidence: 0.8,
      },
      [FAILURE_CATEGORIES.ASSERTION]: {
        rootCause: "Assertion mismatch – actual values differ from expected, possible regression or data change",
        suggestedFix: "1. Verify expected values reflect current business logic. 2. Check if API contract has changed. 3. Review recent deployments.",
        severity: "high",
        confidence: 0.7,
      },
      [FAILURE_CATEGORIES.AUTH]: {
        rootCause: "Authentication/authorization failure – tokens may be expired or misconfigured",
        suggestedFix: "1. Refresh AUTH_TOKEN in environment. 2. Verify API key permissions. 3. Check token expiry settings.",
        severity: "critical",
        confidence: 0.85,
      },
      [FAILURE_CATEGORIES.UNKNOWN]: {
        rootCause: "Unclassified failures require manual investigation",
        suggestedFix: "Review stack traces individually. Add more specific error handling to narrow down root cause.",
        severity: "medium",
        confidence: 0.4,
      },
    };

    return templates[category] || templates[FAILURE_CATEGORIES.UNKNOWN];
  }

  // ── Prompt construction ────────────────────────────────────────────────────
  _buildPrompt(category, failures) {
    const sample = failures.slice(0, 3); // cap tokens
    return `
Analyze these ${failures.length} test failures (category: ${category}).

FAILURES:
${sample
  .map(
    (f, i) => `
[${i + 1}] Test: "${f.testName}" in "${f.suiteName}"
    Error: ${f.errorMessage.slice(0, 300)}
    Stack: ${f.stackTrace.slice(0, 400)}
    Duration: ${f.duration}ms
`
  )
  .join("\n")}

Return ONLY this JSON structure:
{
  "rootCause": "concise 1-2 sentence root cause",
  "suggestedFix": "numbered list of actionable steps",
  "severity": "critical|high|medium|low",
  "confidence": 0.0-1.0,
  "isFlaky": true|false,
  "additionalContext": "any extra insight"
}
`.trim();
  }

  // ── Report assembly ────────────────────────────────────────────────────────
  _buildReport(groups, rawResults, failures) {
    const stats = rawResults.stats || {};
    return {
      generatedAt: new Date().toISOString(),
      aiEnabled: this.aiEnabled,
      mode: this.aiEnabled ? "groq-ai" : "heuristic-mock",
      summary: {
        totalTests: stats.expected || 0,
        passed: (stats.expected || 0) - failures.length,
        failed: failures.length,
        flaky: groups.filter((g) => g.analysis?.isFlaky).length,
        passRate: stats.expected
          ? (((stats.expected - failures.length) / stats.expected) * 100).toFixed(1) + "%"
          : "N/A",
      },
      rootCauseGroups: groups,
      recommendations: this._topRecommendations(groups),
    };
  }

  _topRecommendations(groups) {
    return groups
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((g) => ({
        priority: g.analysis?.severity || "medium",
        action: g.analysis?.suggestedFix || "Investigate manually",
        affectedTests: g.count,
        category: g.category,
      }));
  }

  // ── Console summary ────────────────────────────────────────────────────────
  _printSummary(report) {
    const sep = "─".repeat(60);
    console.log(`\n${sep}`);
    console.log("  🤖  AI FAILURE ANALYSIS REPORT");
    console.log(sep);
    console.log(`  Mode:        ${report.mode}`);
    console.log(
      `  Pass Rate:   ${report.summary.passRate} (${report.summary.passed}/${report.summary.totalTests})`
    );
    console.log(`  Failed:      ${report.summary.failed} tests`);
    console.log(`  Root Causes: ${report.rootCauseGroups.length} unique groups`);
    console.log(sep);

    for (const g of report.rootCauseGroups) {
      console.log(`\n  [${g.category.toUpperCase()}] – ${g.count} test(s)`);
      console.log(`  Root cause: ${g.analysis?.rootCause || "Unknown"}`);
      console.log(`  Severity:   ${g.analysis?.severity || "?"}`);
      console.log(`  Fix:        ${g.analysis?.suggestedFix?.split("\n")[0] || "Review manually"}`);
    }

    console.log(`\n  Full report: reports/ai-analysis.json\n${sep}\n`);
  }
}

// ── CLI entry point ────────────────────────────────────────────────────────
if (require.main === module) {
  new FailureAnalyzer()
    .analyze()
    .then(() => process.exit(0))
    .catch((err) => {
      aiLog.error("Fatal error in failure analyzer", { error: err.message });
      process.exit(1);
    });
}

module.exports = FailureAnalyzer;
