// tests/api/users.spec.js
/**
 * Users API Test Suite
 * ═══════════════════
 * Target: https://reqres.in/api/users (public REST testing API)
 *
 * Coverage:
 *  • Pagination & listing          (GET /users)
 *  • Single resource retrieval     (GET /users/:id)
 *  • Resource creation             (POST /users)
 *  • Full update                   (PUT /users/:id)
 *  • Partial update                (PATCH /users/:id)
 *  • Deletion                      (DELETE /users/:id)
 *  • 404 handling                  (GET /users/9999)
 *  • Input validation / negatives
 *  • Response schema contract
 *  • Pagination boundary values
 */

const { test, expect } = require("../fixtures/api.fixture");

// ── Helpers ────────────────────────────────────────────────────────────────
const USER_SCHEMA_FIELDS = ["id", "email", "first_name", "last_name", "avatar"];

function assertUserSchema(user) {
  USER_SCHEMA_FIELDS.forEach((field) => {
    expect(user, `User object missing '${field}'`).toHaveProperty(field);
  });
  expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  expect(typeof user.id).toBe("number");
}

// ══════════════════════════════════════════════════════════════════════════
// GET /users – list
// ══════════════════════════════════════════════════════════════════════════
test.describe("GET /users – list users", () => {
  test("returns 200 with paginated list @smoke", async ({ api }) => {
    const res = await api.get("/users", { page: 1 });

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("data");
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data.data.length).toBeGreaterThan(0);
  });

  test("response includes pagination metadata @smoke", async ({ api }) => {
    const res = await api.get("/users", { page: 1 });

    expect(res.data).toHaveProperty("page");
    expect(res.data).toHaveProperty("per_page");
    expect(res.data).toHaveProperty("total");
    expect(res.data).toHaveProperty("total_pages");
    expect(res.data.page).toBe(1);
  });

  test("each user in list satisfies schema contract", async ({ api }) => {
    const res = await api.get("/users", { page: 1 });

    res.data.data.forEach((user) => assertUserSchema(user));
  });

  test("page 2 returns different users than page 1", async ({ api }) => {
    const [p1, p2] = await Promise.all([
      api.get("/users", { page: 1 }),
      api.get("/users", { page: 2 }),
    ]);

    const ids1 = p1.data.data.map((u) => u.id);
    const ids2 = p2.data.data.map((u) => u.id);
    const intersection = ids1.filter((id) => ids2.includes(id));

    expect(intersection).toHaveLength(0);
  });

  test("boundary: page beyond total_pages returns empty data", async ({ api }) => {
    const meta = await api.get("/users", { page: 1 });
    const lastPage = meta.data.total_pages;
    const res = await api.get("/users", { page: lastPage + 999 });

    expect(res.status).toBe(200);
    expect(res.data.data).toHaveLength(0);
  });

  test("response time is under 3000ms", async ({ api }) => {
    const res = await api.get("/users", { page: 1 });
    expect(res.duration).toBeLessThan(3000);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// GET /users/:id – single user
// ══════════════════════════════════════════════════════════════════════════
test.describe("GET /users/:id – single user", () => {
  test("returns 200 for valid user ID @smoke", async ({ api }) => {
    const res = await api.get("/users/2");

    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("data");
    assertUserSchema(res.data.data);
  });

  test("user data matches requested ID", async ({ api }) => {
    const targetId = 3;
    const res = await api.get(`/users/${targetId}`);

    expect(res.data.data.id).toBe(targetId);
  });

  test("returns 404 for non-existent user ID", async ({ api }) => {
    try {
      await api.get("/users/9999");
      throw new Error("Should have thrown");
    } catch (err) {
      expect(err.status).toBe(404);
    }
  });

  test("returns support info in envelope", async ({ api }) => {
    const res = await api.get("/users/1");
    expect(res.data).toHaveProperty("support");
    expect(res.data.support).toHaveProperty("url");
    expect(res.data.support).toHaveProperty("text");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// POST /users – create user
// ══════════════════════════════════════════════════════════════════════════
test.describe("POST /users – create user", () => {
  test("creates user and returns 201 with ID @smoke", async ({ api, factory }) => {
    const payload = factory.createUserPayload();
    const res = await api.post("/users", payload);

    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty("id");
    expect(res.data).toHaveProperty("createdAt");
    expect(res.data.name).toBe(payload.name);
    expect(res.data.job).toBe(payload.job);
  });

  test("generated ID is a non-empty string", async ({ api, factory }) => {
    const payload = factory.createUserPayload();
    const res = await api.post("/users", payload);

    expect(typeof res.data.id).toBe("string");
    expect(res.data.id.length).toBeGreaterThan(0);
  });

  test("createdAt is a valid ISO timestamp", async ({ api, factory }) => {
    const payload = factory.createUserPayload();
    const res = await api.post("/users", payload);

    const date = new Date(res.data.createdAt);
    expect(isNaN(date.getTime())).toBe(false);
    // Should be recent (within last 60 seconds)
    expect(Date.now() - date.getTime()).toBeLessThan(60_000);
  });

  test("handles very long name field", async ({ api, factory }) => {
    const payload = factory.createUserPayload({
      name: "A".repeat(255),
    });
    const res = await api.post("/users", payload);
    // reqres.in accepts it – testing server tolerates long strings
    expect([200, 201]).toContain(res.status);
  });

  test("accepts unicode characters in name", async ({ api }) => {
    const payload = { name: "José García 🚀", job: "engineer" };
    const res = await api.post("/users", payload);
    expect(res.status).toBe(201);
    expect(res.data.name).toBe(payload.name);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PUT /users/:id – full update
// ══════════════════════════════════════════════════════════════════════════
test.describe("PUT /users/:id – full update", () => {
  test("returns 200 with updated fields @smoke", async ({ api, factory }) => {
    const payload = factory.updateUserPayload();
    const res = await api.put("/users/2", payload);

    expect(res.status).toBe(200);
    expect(res.data.name).toBe(payload.name);
    expect(res.data.job).toBe(payload.job);
    expect(res.data).toHaveProperty("updatedAt");
  });

  test("updatedAt is more recent than a timestamp before the call", async ({
    api,
    factory,
  }) => {
    const before = Date.now();
    const res = await api.put("/users/2", factory.updateUserPayload());
    const updatedAt = new Date(res.data.updatedAt).getTime();

    expect(updatedAt).toBeGreaterThanOrEqual(before - 2000); // 2s slack for clock drift
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PATCH /users/:id – partial update
// ══════════════════════════════════════════════════════════════════════════
test.describe("PATCH /users/:id – partial update", () => {
  test("returns 200 and reflects partial change", async ({ api }) => {
    const res = await api.patch("/users/2", { job: "qa-lead" });

    expect(res.status).toBe(200);
    expect(res.data.job).toBe("qa-lead");
    expect(res.data).toHaveProperty("updatedAt");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// DELETE /users/:id
// ══════════════════════════════════════════════════════════════════════════
test.describe("DELETE /users/:id", () => {
  test("returns 204 No Content for valid user", async ({ api }) => {
    const res = await api.delete("/users/2");
    expect(res.status).toBe(204);
  });

  test("response body is empty on 204", async ({ api }) => {
    const res = await api.delete("/users/3");
    expect(res.status).toBe(204);
    // No body expected
    const body = res.data;
    expect(body === null || body === "" || body === undefined).toBe(true);
  });
});
