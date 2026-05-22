import type { BaseClient, RequestOptions } from "./client.js";

export interface PageResponse<T> {
  data: T[];
  hasMore: boolean;
}

export class CursorPage<T> implements AsyncIterable<T> {
  private client: BaseClient;
  private options: RequestOptions;
  private cursorParam: string;
  private extractPage: (response: unknown) => PageResponse<T>;

  constructor(
    client: BaseClient,
    options: RequestOptions,
    cursorParam: string,
    extractPage: (response: unknown) => PageResponse<T>,
  ) {
    this.client = client;
    this.options = options;
    this.cursorParam = cursorParam;
    this.extractPage = extractPage;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let cursor: string | undefined;

    while (true) {
      const query = { ...this.options.query };
      if (cursor) query[this.cursorParam] = cursor;

      const response = await this.client.request<unknown>({
        ...this.options,
        query,
      });

      const page = this.extractPage(response);
      for (const item of page.data) {
        yield item;
      }

      if (!page.hasMore || page.data.length === 0) break;

      const lastItem = page.data[page.data.length - 1] as Record<string, unknown>;
      cursor = lastItem?.["id"] as string | undefined;
      if (!cursor) break;
    }
  }
}

export class OffsetPage<T> implements AsyncIterable<T> {
  private client: BaseClient;
  private options: RequestOptions;
  private limitParam: string;
  private offsetParam: string;
  private extractPage: (response: unknown) => PageResponse<T>;

  constructor(
    client: BaseClient,
    options: RequestOptions,
    limitParam: string,
    offsetParam: string,
    extractPage: (response: unknown) => PageResponse<T>,
  ) {
    this.client = client;
    this.options = options;
    this.limitParam = limitParam;
    this.offsetParam = offsetParam;
    this.extractPage = extractPage;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let offset = 0;
    const limit = (this.options.query?.[this.limitParam] as number) ?? 20;

    while (true) {
      const query = { ...this.options.query };
      query[this.limitParam] = limit;
      query[this.offsetParam] = offset;

      const response = await this.client.request<unknown>({
        ...this.options,
        query,
      });

      const page = this.extractPage(response);
      for (const item of page.data) {
        yield item;
      }

      if (!page.hasMore || page.data.length === 0) break;
      offset += page.data.length;
    }
  }
}
