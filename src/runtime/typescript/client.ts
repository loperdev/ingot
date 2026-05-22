import { APIError, TimeoutError } from "./error.js";

export interface RequestOptions {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface BaseClientConfig {
  baseUrl: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export class BaseClient {
  protected readonly baseUrl: string;
  protected readonly headers: Record<string, string>;
  protected readonly timeout: number;
  protected readonly maxRetries: number;

  constructor(config: BaseClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...config.headers,
    };
    this.timeout = config.timeout ?? 30_000;
    this.maxRetries = config.maxRetries ?? 2;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const url = new URL(options.path, this.baseUrl);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = { ...this.headers, ...options.headers };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelay(attempt, lastError);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url.toString(), {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          let parsed: unknown = body;
          try { parsed = JSON.parse(body); } catch { /* raw text */ }

          const error = APIError.from(response.status, parsed, response.headers);
          if (this.shouldRetry(response.status, attempt)) {
            lastError = error;
            continue;
          }
          throw error;
        }

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof APIError) throw err;
        if (err instanceof Error && err.name === "AbortError") {
          lastError = new TimeoutError(options.method, options.path);
          if (attempt < this.maxRetries) continue;
          throw lastError;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("Request failed after retries");
  }

  private shouldRetry(status: number, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    return status === 429 || status >= 500;
  }

  private retryDelay(attempt: number, error: Error | null): number {
    if (error instanceof APIError && error.status === 429) {
      const retryAfter = error.headers.get("retry-after");
      if (retryAfter) {
        const seconds = parseFloat(retryAfter);
        if (!isNaN(seconds)) return seconds * 1000;
      }
    }
    const base = Math.min(1000 * 2 ** attempt, 8000);
    const jitter = base * 0.2 * Math.random();
    return base + jitter;
  }
}
