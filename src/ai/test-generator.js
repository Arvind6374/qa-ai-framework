// src/ai/test-generator.js
/**
 * AI Test Generator
 * ═════════════════
 * Analyses an API endpoint (or OpenAPI spec) and generates Playwright test
 * cases covering happy path, boundary values, and negative scenarios.
 *
 * Workflow:
 *  1. Accept an endpoint description or OpenAPI JSON
 *  2. Ask Groq LLM to produce structured test case specs
 *  3. Render those specs into runnable Playwright test files
 *  4. Write them to tests/generated/ for human review before merge
 *
 * This addresses the "blank page" problem: a QA engineer gets a new endpoint
 * and spends 30 mins writing boilerplate. This tool produces a 70% complete
 * test file in ~5 seconds, leaving the engineer to focus on edge cases and
 * domain knowledge.
 */

const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");
const env = require("../config/env");

const aiLog = logger.forAI();

class TestGenerator {
  constructor() {
    this.outputDir = path.resolve("tests/generated");
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  async generateForEndpoint(endpointSpec) {
    aiLog.info("Generating tests for endpoint…", { endpoint: endpointSpec.path });

    const testCases = env.aiEnabled
      ? await this._aiGenerate(endpointSpec)
      : this._templateGenerate(endpointSpec);

    const code = this._renderTestFile(endpointSpec, testCases);
    const filename = this._filename(endpointSpec);
    const filePath = path.join(this.outputDir, filename);

    fs.writeFileSync(filePath, code);
    aiLog.info(`Generated ${testCases.length} test cases → ${filePath}`);

    return { filePath, testCases, code };
  }

  // ── AI generation via Groq ────────────────────────────────────────────────
  async _aiGenerate(spec) {
    const prompt = `
You are a senior QA automation engineer. Generate comprehensive test cases for this API endpoint.

ENDPOINT SPEC:
${JSON.stringify(spec, null, 2)}

Generate test cases as a JSON array. Each item must have:
{
  "name": "descriptive test name",
  "description": "what this tests",
  "type": "happy_path|boundary|negative|security",
  "method": "GET|POST|PUT|PATCH|DELETE",
  "path": "/api/...",
  "requestBody": {} or null,
  "queryParams": {} or null,
  "expectedStatus": 200,
  "expectedFields": ["field1", "field2"],
  "assertions": ["list of plain-English assertions to make"]
}

Cover: happy path, missing required fields, invalid data types, boundary values, auth scenarios.
Respond ONLY with the JSON array, no markdown, no preamble.
`.trim();

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.groqApiKey}`,
        },
        body: JSON.stringify({
          model: env.aiModel,
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || "[]";
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    } catch (err) {
      aiLog.warn("AI generation failed, using templates", { error: err.message });
      return this._templateGenerate(spec);
    }
  }

  // ── Template generation (no AI key needed) ────────────────────────────────
  _templateGenerate(spec) {
    const { method = "GET", path: endpointPath, requiredFields = [] } = spec;

    const cases = [
      // Happy path
      {
        name: `${method} ${endpointPath} – returns 2xx for valid request`,
        type: "happy_path",
        method,
        path: endpointPath,
        requestBody: spec.sampleBody || null,
        expectedStatus: method === "POST" ? 201 : 200,
        assertions: ["Status code is correct", "Response body contains expected fields"],
      },
    ];

    // Negative cases for required fields
    for (const field of requiredFields) {
      const bodyWithout = { ...(spec.sampleBody || {}), [field]: undefined };
      cases.push({
        name: `${method} ${endpointPath} – missing required field '${field}'`,
        type: "negative",
        method,
        path: endpointPath,
        requestBody: bodyWithout,
        expectedStatus: 400,
        assertions: [`Response indicates '${field}' is required`],
      });
    }

    // Boundary: empty body for POST/PUT
    if (["POST", "PUT", "PATCH"].includes(method)) {
      cases.push({
        name: `${method} ${endpointPath} – empty body returns 400`,
        type: "boundary",
        method,
        path: endpointPath,
        requestBody: {},
        expectedStatus: 400,
        assertions: ["Server rejects empty payload"],
      });
    }

    // Auth case
    cases.push({
      name: `${method} ${endpointPath} – unauthorized without token`,
      type: "security",
      method,
      path: endpointPath,
      requestBody: spec.sampleBody || null,
      headers: { Authorization: "Bearer invalid-token" },
      expectedStatus: 401,
      assertions: ["Returns 401 Unauthorized"],
    });

    return cases;
  }

  // ── Code renderer ─────────────────────────────────────────────────────────
  _renderTestFile(spec, testCases) {
    const groupName = `[AI-Generated] ${spec.method || "API"} ${spec.path}`;
    const testBlocks = testCases
      .map((tc) => this._renderTestCase(tc))
      .join("\n\n");

    return `// ⚠️  AUTO-GENERATED by qa-ai-framework TestGenerator
// Review before merging – validate assertions match your API contract
// Generated: ${new Date().toISOString()}

const { test, expect } = require('@playwright/test');
const ApiClient = require('../../src/utils/api-client');
const env = require('../../src/config/env');

const client = new ApiClient(env.apiBaseURL);

test.describe('${groupName}', () => {
${testBlocks}
});
`;
  }

  _renderTestCase(tc) {
    const bodyStr = tc.requestBody
      ? `\n    const body = ${JSON.stringify(tc.requestBody, null, 6).replace(/\n/g, "\n    ")};`
      : "";

    const methodCall =
      tc.method === "GET"
        ? `await client.get('${tc.path}', ${JSON.stringify(tc.queryParams || {})})`
        : `await client.${tc.method.toLowerCase()}('${tc.path}', body)`;

    const assertionComments = (tc.assertions || [])
      .map((a) => `    // Assert: ${a}`)
      .join("\n");

    return `  test('${tc.name.replace(/'/g, "\\'")}', async () => {
    // Type: ${tc.type}
${bodyStr}
    const response = await ${methodCall};

${assertionComments}
    expect(response.status).toBe(${tc.expectedStatus});
    ${
      tc.expectedFields?.length
        ? tc.expectedFields.map((f) => `expect(response.data).toHaveProperty('${f}');`).join("\n    ")
        : ""
    }
  });`;
  }

  // ── Filename from spec ────────────────────────────────────────────────────
  _filename(spec) {
    const clean = (spec.path || "endpoint")
      .replace(/[^a-z0-9]/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return `${(spec.method || "api").toLowerCase()}-${clean}.generated.spec.js`;
  }
}

// ── CLI demo ───────────────────────────────────────────────────────────────
if (require.main === module) {
  const gen = new TestGenerator();

  // Example: generate tests for the reqres.in users endpoint
  gen
    .generateForEndpoint({
      method: "POST",
      path: "/users",
      description: "Create a new user",
      requiredFields: ["name", "job"],
      sampleBody: { name: "Alice Smith", job: "engineer" },
      responseSchema: {
        id: "string",
        name: "string",
        job: "string",
        createdAt: "string",
      },
    })
    .then((result) => {
      console.log(`\n✅ Generated ${result.testCases.length} test cases`);
      console.log(`📄 File: ${result.filePath}`);
    })
    .catch((err) => {
      aiLog.error("Generator failed", { error: err.message });
      process.exit(1);
    });
}

module.exports = TestGenerator;
