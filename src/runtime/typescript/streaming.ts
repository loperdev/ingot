import { APIError } from "./error.js";
import type { BaseClient, RequestConfig } from "./client.js";

export interface StreamEvent<T = unknown> {
  event?: string;
  data: T;
}

export class Stream<T> implements AsyncIterable<T> {
  private response: Response;
  private parse: (data: string) => T;

  constructor(response: Response, parse: (data: string) => T) {
    this.response = response;
    this.parse = parse;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    const reader = this.response.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentData = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const payload = line.slice(6);
            if (payload === "[DONE]") return;
            currentData = payload;
          } else if (line === "" && currentData) {
            yield this.parse(currentData);
            currentData = "";
          }
        }
      }

      if (buffer.startsWith("data: ") && buffer.slice(6) !== "[DONE]") {
        yield this.parse(buffer.slice(6));
      }
    } finally {
      reader.releaseLock();
    }
  }
}

export interface StreamRequestOptions {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
  requestConfig?: RequestConfig;
}

export async function createStream<T>(
  client: BaseClient,
  options: StreamRequestOptions,
  parse: (data: string) => T = (d) => JSON.parse(d) as T,
): Promise<Stream<T>> {
  const baseUrl = (client as unknown as { baseUrl: string }).baseUrl;
  const clientHeaders = (client as unknown as { headers: Record<string, string> }).headers;
  const timeout = options.requestConfig?.timeout ?? (client as unknown as { timeout: number }).timeout;

  const url = new URL(options.path, baseUrl);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    ...clientHeaders,
    ...options.headers,
    ...options.requestConfig?.headers,
    "Accept": "text/event-stream",
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  if (options.requestConfig?.signal) {
    options.requestConfig.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

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
    throw APIError.from(response.status, parsed, response.headers);
  }

  return new Stream(response, parse);
}
