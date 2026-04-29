# QA-AI Framework

> **Production-ready, AI-enhanced test automation for engineering teams transitioning from manual to intelligent testing.**

[![CI Pipeline](https://github.com/Arvind6374/qa-ai-framework/actions/workflows/qa-pipeline.yml/badge.svg)](https://github.com/Arvind6374/qa-ai-framework/actions)
![Playwright](https://img.shields.io/badge/Playwright-1.44-green)
![Node](https://img.shields.io/badge/Node-20-blue)
![License](https://img.shields.io/badge/License-MIT-lightgrey)

---

## What This Is

A portfolio-grade QA automation system that demonstrates how a modern engineering team should approach test infrastructure—not as an afterthought, but as a first-class engineering discipline.

**Target application:** [reqres.in](https://reqres.in) — a public REST API + minimal UI, chosen because it:
- Has a stable, well-defined API contract (good for regression detection)
- Includes auth, CRUD, pagination (broad coverage opportunity)
- Is publicly accessible (zero infrastructure cost, works in CI instantly)

**Why Playwright over Selenium/Cypress:**
- Native async/await with no callback hell
- Built-in multi-browser, mobile viewport, and network interception
- First-class TypeScript + JS support
- Faster than Selenium (no WebDriver protocol overhead)
- More flexible than Cypress (cross-origin, multiple tabs, file downloads)

---

## Architecture

```
qa-ai-framework/
├── .github/
│   └── workflows/
│       └── qa-pipeline.yml       # 5-job CI/CD pipeline
├── src/
│   ├── ai/
│   │   ├── failure-analyzer.js   # ★ Core AI: root-cause grouping via Groq
│   │   └── test-generator.js     # ★ AI: generates test cases from API spec
│   ├── config/
│   │   ├── env.js                # Centralised env/config management
│   │   ├── global-setup.js       # Pre-suite: dir creation, connectivity check
│   │   └── global-teardown.js    # Post-suite: session metadata finalization
│   ├── reporters/
│   │   ├── ai-reporter.js        # Custom Playwright reporter (lifecycle hooks)
│   │   └── html-reporter.js      # Analytics dashboard generator
│   └── utils/
│       ├── api-client.js         # Logged HTTP client with retry + correlation IDs
│       ├── data-factory.js       # Seeded test data generation + boundary values
│       └── logger.js             # Structured Winston logger (console + file)
├── tests/
│   ├── api/
│   │   ├── users.spec.js         # 18 user CRUD tests
│   │   └── auth.spec.js          # 11 auth + security tests
│   ├── ui/
│   │   └── homepage.spec.js      # 14 UI + accessibility tests
│   ├── fixtures/
│   │   └── api.fixture.js        # Shared test fixtures (api client, factory, logger)
│   └── generated/                # AI-generated test files (git-ignored until reviewed)
├── docs/
│   └── BUG-001-sql-injection-auth.md
├── reports/                      # Generated after test runs (git-ignored)
├── playwright.config.js
├── package.json
└── .env.example
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **DRY** | Shared fixtures (`api.fixture.js`) inject `ApiClient`, `DataFactory`, logger into every test |
| **Fail fast** | Smoke tests run before full suite in CI; lint runs before everything |
| **Deterministic** | `DataFactory` uses seeded RNG → same test always gets same data |
| **Observable** | Every HTTP call logged with correlation ID; structured JSON logs for AI ingestion |
| **Recoverable** | `ApiClient` auto-retries 5xx/429 with exponential back-off |

---

## The AI Layer

The AI component solves a **real, frequent problem**: a 200-test suite fails 15 tests that all stem from the same broken API endpoint. Without grouping, engineers investigate 15 nearly identical stack traces. With AI analysis, those collapse into 1 actionable finding.

### Failure Analyzer (`src/ai/failure-analyzer.js`)

**Flow:**
```
Test Run → results.json → FailureAnalyzer
                              │
                              ├─ heuristic pre-categorization (instant, free)
                              │    (timeout / network / selector / assertion / auth)
                              │
                              ├─ Groq API call per category group
                              │    (sends up to 3 sample stack traces)
                              │
                              └─ Structured report: root cause + fix + severity
                                   → reports/ai-analysis.json
```

**Mock mode:** When `GROQ_API_KEY` is absent, the heuristic layer still produces category groupings and fix suggestions—the framework is **fully functional without an API key**.

**Sample output:**
```json
{
  "rootCauseGroups": [{
    "category": "network-connectivity",
    "count": 8,
    "analysis": {
      "rootCause": "ECONNREFUSED on /api/users suggests the target server restarted between test runs",
      "suggestedFix": "1. Check deployment status\n2. Add health check gate before test suite\n3. Increase retry count for network errors",
      "severity": "critical",
      "confidence": 0.91,
      "isFlaky": false
    }
  }]
}
```

### Test Generator (`src/ai/test-generator.js`)

Given an endpoint spec (method, path, required fields, sample body), generates a complete Playwright test file with happy-path, negative, boundary, and security cases. Output goes to `tests/generated/` for human review before merge.

```bash
node src/ai/test-generator.js
# → tests/generated/post--users.generated.spec.js
```

---

## Test Suite Overview

| Suite | File | Tests | Tags |
|-------|------|-------|------|
| Users CRUD | `tests/api/users.spec.js` | 18 | `@smoke` on key tests |
| Authentication | `tests/api/auth.spec.js` | 11 | `@smoke` on happy paths |
| UI Homepage | `tests/ui/homepage.spec.js` | 14 | `@smoke` on load/nav |
| **Total** | | **43 tests** | |

**Coverage by type:**
- Happy path
- Schema/contract validation
- Boundary values (empty body, max-length strings, page overflow)
- Negative/error cases (404, 400, missing required fields)
- Security (SQL injection, XSS – don't cause 500s)
- Performance (response time assertions)
- Accessibility (lang attribute, alt text)

---

## CI/CD Pipeline

```
push / PR
    │
    ▼
[lint]          < 1 min  – ESLint + secret scanning
    │
    ▼
[smoke]         ~2 min   – @smoke tagged tests on Chromium only
    │
    ▼
[full-suite] ──────────────────────────┐
  chromium │ firefox │ api (parallel)  │  ~6 min
                                       │
    ▼                                  │
[ai-analysis]   ~1 min   – only on failure (Groq root-cause)
    │
    ▼
[publish-report]          – HTML dashboard → GitHub Pages (main branch)
```

**Shift-left features:**
- Lint catches broken syntax before any test infrastructure spins up
- Smoke gate prevents full suite from running if critical paths are broken
- Parallel matrix (3 projects) cuts wall-clock time by ~60%
- Daily scheduled run catches external API drift

---

## Getting Started

### Prerequisites
- Node.js 20+
- npm 9+

### Installation

```bash
git clone https://github.com/Arvind6374/qa-ai-framework
cd qa-ai-framework
npm install
npx playwright install --with-deps
cp .env.example .env
```

### Running Tests

```bash
# All tests
npm test

# Smoke tests only (fast, ~2 min)
npx playwright test --grep "@smoke"

# API tests only
npx playwright test tests/api/

# UI tests only
npx playwright test tests/ui/

# Headed (watch the browser)
npm run test:headed

# Debug mode (step through)
npm run test:debug

# Specific browser
npx playwright test --project=firefox
```

### AI Features

```bash
# Analyze failures after a run (requires GROQ_API_KEY or runs in mock mode)
npm run analyze:failures

# Generate tests for a new endpoint
npm run generate:tests

# Build the HTML dashboard
npm run generate:report
# → opens reports/html/qa-dashboard.html
```

### Viewing Results

```bash
# Playwright's built-in HTML report
npm run test:report

# Custom AI dashboard
npm run generate:report
open reports/html/qa-dashboard.html
```

---

## Configuration

All configuration lives in `.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://reqres.in` | Target web app |
| `API_BASE_URL` | `https://reqres.in/api` | Target API base |
| `GROQ_API_KEY` | — | Enables Groq AI analysis (optional) |
| `TEST_ENV` | `development` | Environment label in reports |
| `HEADLESS` | `true` | Set `false` to see browser during local runs |
| `LOG_LEVEL` | `info` | `debug` for verbose output |

---

## Extending the Framework

### Adding a new API test suite

1. Create `tests/api/your-resource.spec.js`
2. Import and use the shared fixture:
   ```js
   const { test, expect } = require('../fixtures/api.fixture');
   
   test.describe('GET /your-endpoint', () => {
     test('happy path @smoke', async ({ api, factory, log }) => {
       log.info('Testing my endpoint');
       const payload = factory.createUserPayload();
       const res = await api.get('/your-endpoint');
       expect(res.status).toBe(200);
     });
   });
   ```

### Adding a new UI test suite

1. Create `tests/ui/your-page.spec.js`
2. Use standard Playwright `test` from `@playwright/test`
3. Tag smoke tests with `@smoke`

### Adding a new AI capability

Extend `src/ai/` — the failure analyzer and test generator are designed as independent modules. New ideas:
- **Predictive prioritization**: score tests by historical flakiness and run risky ones first
- **Visual regression analysis**: send screenshot diffs to Groq for natural-language change descriptions
- **Performance anomaly detection**: flag tests whose duration is a statistical outlier

---

## Logging

All logs are structured JSON at `reports/combined.log`:

```json
{"level":"info","message":"→ GET /users","correlationId":"A3F9B2","timestamp":"2024-11-14 09:12:33","subsystem":"api-client"}
{"level":"info","message":"← 200 /users (287ms)","correlationId":"A3F9B2","timestamp":"2024-11-14 09:12:33","duration":287}
```

Each HTTP call gets a correlation ID linking request → response in the logs — essential for debugging async parallel test failures.

---

## Bug Report

See [docs/BUG-001-sql-injection-auth.md](docs/BUG-001-sql-injection-auth.md) for a full example of how the framework surfaces and documents a security finding.

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| [Playwright](https://playwright.dev) | Cross-browser automation |
| [Winston](https://github.com/winstonjs/winston) | Structured logging |
| [Axios](https://axios-http.com) | HTTP client with interceptors |
| [Groq API](https://groq.com) | AI failure analysis + test generation |
| [GitHub Actions](https://github.com/features/actions) | CI/CD pipeline |

---

## License

MIT
