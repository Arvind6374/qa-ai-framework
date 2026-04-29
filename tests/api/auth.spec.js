// tests/api/auth.spec.js
/**
 * Authentication API Test Suite
 * ══════════════════════════════
 * Target: https://reqres.in/api/login & /api/register
 *
 * Coverage:
 *  • Successful login
 *  • Failed login (missing password)
 *  • Successful registration
 *  • Failed registration (missing password)
 *  • Token presence and format validation
 *  • Security: SQL injection attempt
 *  • Security: XSS in email field
 */

const { test, expect } = require("../fixtures/api.fixture");
const { factory } = require("../../src/utils/data-factory");

// reqres.in has predefined valid credentials
const VALID_CREDENTIALS = { email: "eve.holt@reqres.in", password: "cityslicka" };
const VALID_REGISTER = { email: "eve.holt@reqres.in", password: "pistol" };

// ══════════════════════════════════════════════════════════════════════════
// POST /login
// ══════════════════════════════════════════════════════════════════════════
test.describe("POST /login", () => {
  test("returns 200 and token for valid credentials @smoke", async ({ api }) => {
    const res = await api.post("/login", VALID_CREDENTIALS);

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("token");
    expect(typeof res.data.token).toBe("string");
    expect(res.data.token.length).toBeGreaterThan(0);
  });

  test("token format is non-trivial (not empty string or whitespace)", async ({ api }) => {
    const res = await api.post("/login", VALID_CREDENTIALS);
    expect(res.data.token.trim().length).toBeGreaterThan(3);
  });

  test("missing password returns 400 with error message", async ({ api }) => {
    try {
      await api.post("/login", { email: VALID_CREDENTIALS.email });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.data).toHaveProperty("error");
      expect(err.data.error.toLowerCase()).toContain("password");
    }
  });

  test("missing email returns 400", async ({ api }) => {
    try {
      await api.post("/login", { password: "somepassword" });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test("empty body returns 400", async ({ api }) => {
    try {
      await api.post("/login", {});
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  test("security: SQL injection in email field does not 500", async ({ api }) => {
    try {
      await api.post("/login", {
        email: factory.boundaries.sqlInjection,
        password: "test",
      });
    } catch (err) {
      // Acceptable: 400 (invalid user) or 400 (validation error)
      // NOT acceptable: 500 (server error suggesting SQL injection worked)
      expect(err.status).not.toBe(500);
      expect(err.status).toBe(400);
    }
  });

  test("security: XSS payload in email field does not cause 500", async ({ api }) => {
    try {
      await api.post("/login", {
        email: factory.boundaries.xss,
        password: "test",
      });
    } catch (err) {
      expect(err.status).not.toBe(500);
    }
  });

  test("unknown email returns 400 with meaningful error", async ({ api }) => {
    try {
      await api.post("/login", {
        email: "nobody@nowhere-fake-test.com",
        password: "wrongpassword",
      });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.data).toHaveProperty("error");
    }
  });

  test("response time under 3000ms", async ({ api }) => {
    const res = await api.post("/login", VALID_CREDENTIALS);
    expect(res.duration).toBeLessThan(3000);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// POST /register
// ══════════════════════════════════════════════════════════════════════════
test.describe("POST /register", () => {
  test("returns 200 with id and token for valid registration @smoke", async ({ api }) => {
    const res = await api.post("/register", VALID_REGISTER);

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("id");
    expect(res.data).toHaveProperty("token");
    expect(typeof res.data.id).toBe("number");
  });

  test("missing password returns 400 with error", async ({ api }) => {
    try {
      await api.post("/register", { email: VALID_REGISTER.email });
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.data?.error?.toLowerCase()).toContain("password");
    }
  });

  test("undefined user (not in DB) returns 400", async ({ api }) => {
    try {
      await api.post("/register", {
        email: "notindb@example.com",
        password: "password123",
      });
      throw new Error("Should have thrown");
    } catch (err) {
      // reqres.in only allows pre-seeded emails
      expect(err.status).toBe(400);
      expect(err.data).toHaveProperty("error");
    }
  });
});
