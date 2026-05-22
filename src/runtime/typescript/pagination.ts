import type { BaseClient, RequestOptions } from "./client.js";

export interface CursorPageConfig<T> {
  dataField: string;
  cursorField: string;
  cursorQueryParam: string;
  hasMoreField?: string;
}

export interface OffsetPageConfig<T> {
  dataField: string;
  limitParam: string;
  offsetParam: string;
  hasMoreField?: string;
  defaultLimit?: number;
}

export class CursorPage<T> implements AsyncIterable<T> {
  private client: BaseClient;
  private options: RequestOptions;
  private config: CursorPageConfig<T>;

  constructor(
    client: BaseClient,
    options: RequestOptions,
    config: CursorPageConfig<T>,
  ) {
    this.client = client;
    this.options = options;
    this.config = config;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let cursor: string | undefined;

    while (true) {
      const query = { ...this.options.query };
      if (cursor) query[this.config.cursorQueryParam] = cursor;

      const response = await this.client.request<Record<string, unknown>>({
        ...this.options,
        query,
      });

      const items = (response[this.config.dataField] ?? []) as T[];
      for (const item of items) {
        yield item;
      }

      if (items.length === 0) break;

      const nextCursor = response[this.config.cursorField] as string | undefined | null;
      if (!nextCursor) break;

      if (this.config.hasMoreField) {
        const hasMore = response[this.config.hasMoreField] as boolean;
        if (!hasMore) break;
      }

      cursor = nextCursor;
    }
  }
}

export class OffsetPage<T> implements AsyncIterable<T> {
  private client: BaseClient;
  private options: RequestOptions;
  private config: OffsetPageConfig<T>;

  constructor(
    client: BaseClient,
    options: RequestOptions,
    config: OffsetPageConfig<T>,
  ) {
    this.client = client;
    this.options = options;
    this.config = config;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let offset = (this.options.query?.[this.config.offsetParam] as number) ?? 0;
    const limit = (this.options.query?.[this.config.limitParam] as number) ?? this.config.defaultLimit ?? 20;

    while (true) {
      const query = { ...this.options.query };
      query[this.config.limitParam] = limit;
      query[this.config.offsetParam] = offset;

      const response = await this.client.request<Record<string, unknown>>({
        ...this.options,
        query,
      });

      const items = (response[this.config.dataField] ?? []) as T[];
      for (const item of items) {
        yield item;
      }

      if (items.length === 0) break;

      if (this.config.hasMoreField) {
        const hasMore = response[this.config.hasMoreField] as boolean;
        if (!hasMore) break;
      } else if (items.length < limit) {
        break;
      }

      offset += items.length;
    }
  }
}
