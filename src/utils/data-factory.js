// src/utils/data-factory.js
/**
 * DataFactory – deterministic & random test data generation.
 *
 * Design principles:
 *  1. Seed-based determinism: same seed → same data (reproducible CI runs)
 *  2. Domain-specific builders for common entities (users, products, etc.)
 *  3. Boundary-value helpers for edge-case coverage
 *  4. No external network calls – 100% offline-safe
 */

const crypto = require("crypto");

class DataFactory {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this._counter = 0;
  }

  // ── Core RNG (simple LCG seeded from this.seed) ───────────────────────────
  _rand() {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return Math.abs(this.seed) / 0xffffffff;
  }

  _pick(arr) {
    return arr[Math.floor(this._rand() * arr.length)];
  }

  _int(min, max) {
    return Math.floor(this._rand() * (max - min + 1)) + min;
  }

  _id() {
    return ++this._counter;
  }

  // ── User builder ──────────────────────────────────────────────────────────
  user(overrides = {}) {
    const firstNames = ["Alice", "Bob", "Carlos", "Diana", "Eve", "Frank", "Grace", "Hiro"];
    const lastNames = ["Smith", "Jones", "Patel", "Kim", "Nguyen", "Chen", "Garcia"];
    const domains = ["example.com", "test.io", "qa.dev"];

    const firstName = this._pick(firstNames);
    const lastName = this._pick(lastNames);
    const id = this._id();

    return {
      id,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${id}@${this._pick(domains)}`,
      job: this._pick(["engineer", "designer", "manager", "analyst", "qa"]),
      age: this._int(22, 65),
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  }

  // ── Bulk generators ───────────────────────────────────────────────────────
  users(count, overrides = {}) {
    return Array.from({ length: count }, () => this.user(overrides));
  }

  // ── Boundary-value helpers ────────────────────────────────────────────────
  boundaries = {
    emptyString: "",
    whitespace: "   ",
    maxString: "A".repeat(255),
    overMaxString: "A".repeat(256),
    sqlInjection: "' OR '1'='1",
    xss: "<script>alert('xss')</script>",
    unicodeEmoji: "😀🔥💯",
    nullByte: "\0",
    negativeInt: -1,
    zero: 0,
    maxInt: Number.MAX_SAFE_INTEGER,
    floatEdge: 0.1 + 0.2, // classic floating point trap
    veryLongEmail: `${"a".repeat(64)}@${"b".repeat(63)}.com`,
    invalidEmail: "not-an-email",
    pastDate: "1970-01-01T00:00:00Z",
    futureDate: "2099-12-31T23:59:59Z",
  };

  // ── Payload templates ──────────────────────────────────────────────────────
  createUserPayload(overrides = {}) {
    const u = this.user();
    return { name: u.name, job: u.job, ...overrides };
  }

  updateUserPayload(overrides = {}) {
    return {
      name: `Updated ${this.user().name}`,
      job: this._pick(["senior engineer", "lead designer", "director"]),
      ...overrides,
    };
  }

  // ── Hash helper (for assertion reproducibility) ───────────────────────────
  hash(data) {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 8);
  }
}

// Singleton for tests that don't need seed isolation
const factory = new DataFactory(42); // stable seed for reproducible defaults

module.exports = { DataFactory, factory };
