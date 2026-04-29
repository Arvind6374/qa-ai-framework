// src/reporters/html-reporter.js
/**
 * HTML Report Generator
 * ═════════════════════
 * Transforms reports/results.json + reports/ai-analysis.json into a
 * polished, self-contained HTML dashboard.
 *
 * Features:
 *  • Pass/fail/skip metrics with visual donut chart (pure SVG – no CDN)
 *  • Per-suite test table with duration and error messages
 *  • AI analysis panel with root-cause groups
 *  • Fully offline – no external assets
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const REPORTS_DIR = path.resolve("reports");

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function buildReport() {
  const results = loadJSON(path.join(REPORTS_DIR, "results.json"));
  const aiAnalysis = loadJSON(path.join(REPORTS_DIR, "ai-analysis.json"));
  const session = loadJSON(path.join(REPORTS_DIR, "session.json"));

  if (!results) {
    logger.error("No results.json found – run tests first");
    return;
  }

  // ── Flatten test results ─────────────────────────────────────────────────
  const tests = [];
  for (const suite of results.suites || []) {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const last = t.results?.[t.results.length - 1] || {};
        tests.push({
          suite: suite.title,
          title: spec.title,
          status: last.status || "unknown",
          duration: last.duration || 0,
          error: last.errors?.[0]?.message?.split("\n")[0] || null,
          retries: (t.results?.length || 1) - 1,
        });
      }
    }
  }

  const stats = {
    total: tests.length,
    passed: tests.filter((t) => t.status === "passed").length,
    failed: tests.filter((t) => t.status === "failed").length,
    skipped: tests.filter((t) => t.status === "skipped").length,
  };
  stats.passRate = stats.total
    ? ((stats.passed / stats.total) * 100).toFixed(1)
    : "0.0";

  const html = generateHTML(tests, stats, aiAnalysis, session);
  const outputPath = path.join(REPORTS_DIR, "html", "qa-dashboard.html");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, html);
  logger.info(`Dashboard generated: ${outputPath}`);
  return outputPath;
}

function donutSVG(passed, failed, skipped, total) {
  const r = 54;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;

  const passAngle = total ? (passed / total) * 360 : 0;
  const failAngle = total ? (failed / total) * 360 : 0;
  const skipAngle = total ? (skipped / total) * 360 : 0;

  function arc(startDeg, sweepDeg, color) {
    if (sweepDeg <= 0) return "";
    const start = ((startDeg - 90) * Math.PI) / 180;
    const end = ((startDeg + sweepDeg - 90) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = sweepDeg > 180 ? 1 : 0;
    return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}" />`;
  }

  const passPath = arc(0, passAngle, "#22c55e");
  const failPath = arc(passAngle, failAngle, "#ef4444");
  const skipPath = arc(passAngle + failAngle, skipAngle, "#f59e0b");

  return `<svg width="140" height="140" viewBox="0 0 140 140">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#1e293b"/>
    ${passPath}${failPath}${skipPath}
    <circle cx="${cx}" cy="${cy}" r="36" fill="#0f172a"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#f8fafc" font-size="18" font-weight="bold" font-family="monospace">${((passed/total)*100||0).toFixed(0)}%</text>
    <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#94a3b8" font-size="9" font-family="sans-serif">PASS RATE</text>
  </svg>`;
}

function generateHTML(tests, stats, ai, session) {
  const suites = [...new Set(tests.map((t) => t.suite))];
  const now = new Date().toLocaleString();

  const testRows = tests
    .map((t) => {
      const statusClass = { passed: "pass", failed: "fail", skipped: "skip" }[t.status] || "skip";
      const icon = { passed: "✓", failed: "✗", skipped: "○" }[t.status] || "?";
      const errorCell = t.error
        ? `<td class="err-msg">${t.error.slice(0, 120).replace(/</g, "&lt;")}</td>`
        : "<td>—</td>";
      return `<tr class="${statusClass}">
        <td><span class="badge ${statusClass}">${icon}</span></td>
        <td class="suite-cell">${t.suite}</td>
        <td>${t.title}</td>
        <td>${t.duration}ms</td>
        <td>${t.retries}</td>
        ${errorCell}
      </tr>`;
    })
    .join("\n");

  const aiSection = ai
    ? `<section class="card ai-card">
      <h2>🤖 AI Root-Cause Analysis <span class="mode-badge">${ai.mode}</span></h2>
      ${ai.rootCauseGroups
        ?.map(
          (g) => `<div class="ai-group">
          <div class="ai-group-header">
            <span class="cat-badge">${g.category}</span>
            <span class="ai-count">${g.count} test${g.count !== 1 ? "s" : ""}</span>
            <span class="sev-badge sev-${g.analysis?.severity || "medium"}">${g.analysis?.severity || "?"}</span>
          </div>
          <p class="ai-cause"><strong>Root cause:</strong> ${g.analysis?.rootCause || "Unknown"}</p>
          <p class="ai-fix"><strong>Fix:</strong> ${g.analysis?.suggestedFix || "Investigate manually"}</p>
          <details><summary>Affected tests</summary><ul>${g.tests.map((t) => `<li>${t}</li>`).join("")}</ul></details>
        </div>`
        )
        .join("")}
    </section>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>QA-AI Framework – Test Report</title>
<style>
  :root{--bg:#0f172a;--surface:#1e293b;--border:#334155;--text:#f8fafc;--muted:#94a3b8;--green:#22c55e;--red:#ef4444;--yellow:#f59e0b;--blue:#3b82f6;--purple:#a855f7}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;padding:24px}
  h1{font-size:24px;font-weight:700;margin-bottom:4px}
  h2{font-size:16px;font-weight:600;margin-bottom:16px}
  .meta{color:var(--muted);font-size:12px;margin-bottom:32px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:24px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px}
  .stat{text-align:center}
  .stat-num{font-size:36px;font-weight:700;font-variant-numeric:tabular-nums}
  .stat-label{color:var(--muted);font-size:12px;margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
  .donut-card{display:flex;align-items:center;gap:24px}
  .donut-card svg{flex-shrink:0}
  .legend{display:flex;flex-direction:column;gap:8px}
  .leg-item{display:flex;align-items:center;gap:8px;font-size:13px}
  .leg-dot{width:10px;height:10px;border-radius:50%}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.05em;padding:8px 12px;border-bottom:1px solid var(--border)}
  td{padding:8px 12px;border-bottom:1px solid #1e293b;font-size:13px}
  tr.pass td:first-child{color:var(--green)}
  tr.fail{background:rgba(239,68,68,.05)}
  tr.fail td:first-child{color:var(--red)}
  tr.skip td:first-child{color:var(--yellow)}
  .badge{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;font-size:11px;font-weight:700}
  .badge.pass{background:rgba(34,197,94,.15);color:var(--green)}
  .badge.fail{background:rgba(239,68,68,.15);color:var(--red)}
  .badge.skip{background:rgba(245,158,11,.15);color:var(--yellow)}
  .suite-cell{color:var(--muted);font-size:12px}
  .err-msg{color:var(--red);font-size:11px;font-family:monospace;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ai-card{border-color:var(--purple)}
  .ai-group{background:#0f172a;border-radius:8px;padding:16px;margin-bottom:12px}
  .ai-group-header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
  .cat-badge{background:rgba(168,85,247,.2);color:var(--purple);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600}
  .ai-count{color:var(--muted);font-size:12px}
  .sev-badge{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
  .sev-critical{background:rgba(239,68,68,.2);color:var(--red)}
  .sev-high{background:rgba(245,158,11,.2);color:var(--yellow)}
  .sev-medium{background:rgba(59,130,246,.2);color:var(--blue)}
  .sev-low{background:rgba(34,197,94,.2);color:var(--green)}
  .ai-cause,.ai-fix{font-size:13px;line-height:1.5;margin-bottom:6px;color:#cbd5e1}
  details summary{cursor:pointer;font-size:12px;color:var(--muted);margin-top:8px}
  details ul{margin:8px 0 0 20px;font-size:12px;color:var(--muted)}
  .mode-badge{background:rgba(59,130,246,.2);color:var(--blue);padding:2px 8px;border-radius:20px;font-size:11px;margin-left:8px;font-weight:500}
</style>
</head>
<body>
<h1>QA-AI Framework</h1>
<p class="meta">Generated: ${now} ${session ? `| Environment: ${session.environment} | Session: ${session.id}` : ""}</p>

<div class="grid">
  <div class="card donut-card">
    ${donutSVG(stats.passed, stats.failed, stats.skipped, stats.total)}
    <div class="legend">
      <div class="leg-item"><div class="leg-dot" style="background:var(--green)"></div>${stats.passed} Passed</div>
      <div class="leg-item"><div class="leg-dot" style="background:var(--red)"></div>${stats.failed} Failed</div>
      <div class="leg-item"><div class="leg-dot" style="background:var(--yellow)"></div>${stats.skipped} Skipped</div>
    </div>
  </div>
  <div class="card stat"><div class="stat-num" style="color:var(--text)">${stats.total}</div><div class="stat-label">Total Tests</div></div>
  <div class="card stat"><div class="stat-num" style="color:var(--green)">${stats.passed}</div><div class="stat-label">Passed</div></div>
  <div class="card stat"><div class="stat-num" style="color:var(--red)">${stats.failed}</div><div class="stat-label">Failed</div></div>
  <div class="card stat"><div class="stat-num" style="color:var(--text)">${stats.passRate}%</div><div class="stat-label">Pass Rate</div></div>
</div>

${aiSection}

<section class="card">
  <h2>Test Results</h2>
  <table>
    <thead><tr><th></th><th>Suite</th><th>Test</th><th>Duration</th><th>Retries</th><th>Error</th></tr></thead>
    <tbody>${testRows}</tbody>
  </table>
</section>
</body>
</html>`;
}

// CLI
if (require.main === module) {
  const output = buildReport();
  if (output) console.log(`\n✅ Dashboard: ${output}\n`);
}

module.exports = { buildReport };
