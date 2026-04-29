// src/utils/api-client.js
const axios = require("axios");
const logger = require("./logger");

const apiLog = logger.forAPI();

/**
 * Typed, logged API client for test use.
 * Wraps axios with:
 *  - Automatic retry (exponential back-off, configurable)
 *  - Request/response logging (correlation IDs)
 *  - Consistent error shaping so tests catch predictable objects
 */
class ApiClient {
  constructor(baseURL, options = {}) {
    this.baseURL = baseURL;
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelay = options.retryDelay ?? 500;

    this.client = axios.create({
      baseURL,
      timeout: options.timeout ?? 10_000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });

    this._attachInterceptors();
  }

  // ── Interceptors ───────────────────────────────────────────────────────────
  _attachInterceptors() {
    this.client.interceptors.request.use((config) => {
      config.metadata = { startTime: Date.now(), correlationId: this._uuid() };
      apiLog.info(`→ ${config.method?.toUpperCase()} ${config.url}`, {
        correlationId: config.metadata.correlationId,
        params: config.params,
      });
      return config;
    });

    this.client.interceptors.response.use(
      (res) => {
        const duration = Date.now() - res.config.metadata.startTime;
        apiLog.info(`← ${res.status} ${res.config.url} (${duration}ms)`, {
          correlationId: res.config.metadata.correlationId,
          status: res.status,
          duration,
        });
        res.duration = duration;
        return res;
      },
      (err) => {
        const duration = err.config?.metadata
          ? Date.now() - err.config.metadata.startTime
          : null;
        apiLog.error(`✗ ${err.response?.status ?? "ERR"} ${err.config?.url}`, {
          correlationId: err.config?.metadata?.correlationId,
          status: err.response?.status,
          duration,
          message: err.message,
        });
        return Promise.reject(this._shapeError(err));
      }
    );
  }

  // ── HTTP Methods ───────────────────────────────────────────────────────────
  async get(path, params = {}, opts = {}) {
    return this._withRetry(() => this.client.get(path, { params, ...opts }));
  }

  async post(path, body = {}, opts = {}) {
    return this._withRetry(() => this.client.post(path, body, opts));
  }

  async put(path, body = {}, opts = {}) {
    return this._withRetry(() => this.client.put(path, body, opts));
  }

  async patch(path, body = {}, opts = {}) {
    return this._withRetry(() => this.client.patch(path, body, opts));
  }

  async delete(path, opts = {}) {
    return this._withRetry(() => this.client.delete(path, opts));
  }

  // ── Retry wrapper ──────────────────────────────────────────────────────────
  async _withRetry(fn, attempt = 1) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = [429, 500, 502, 503, 504].includes(err.status);
      if (isRetryable && attempt <= this.maxRetries) {
        const delay = this.retryDelay * 2 ** (attempt - 1);
        apiLog.warn(`Retrying request (attempt ${attempt}/${this.maxRetries}) in ${delay}ms`);
        await this._sleep(delay);
        return this._withRetry(fn, attempt + 1);
      }
      throw err;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  _shapeError(err) {
    return {
      status: err.response?.status,
      message: err.message,
      data: err.response?.data,
      url: err.config?.url,
      method: err.config?.method,
    };
  }

  _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  _uuid() {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }
}

module.exports = ApiClient;
