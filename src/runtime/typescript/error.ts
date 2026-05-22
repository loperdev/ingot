export class IngotError extends Error {
  override name = "IngotError";
}

export class APIError extends IngotError {
  override name = "APIError";
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;

  constructor(status: number, body: unknown, headers: Headers, message?: string) {
    super(message ?? `${status} ${APIError.statusText(status)}`);
    this.status = status;
    this.body = body;
    this.headers = headers;
  }

  private static statusText(status: number): string {
    const texts: Record<number, string> = {
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      409: "Conflict",
      422: "Unprocessable Entity",
      429: "Too Many Requests",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
    };
    return texts[status] ?? "Unknown Error";
  }

  static from(status: number, body: unknown, headers: Headers): APIError {
    if (status === 401) return new AuthenticationError(status, body, headers);
    if (status === 403) return new PermissionDeniedError(status, body, headers);
    if (status === 404) return new NotFoundError(status, body, headers);
    if (status === 409) return new ConflictError(status, body, headers);
    if (status === 422) return new UnprocessableEntityError(status, body, headers);
    if (status === 429) return new RateLimitError(status, body, headers);
    if (status >= 500) return new InternalServerError(status, body, headers);
    return new APIError(status, body, headers);
  }
}

export class AuthenticationError extends APIError {
  override name = "AuthenticationError";
}

export class PermissionDeniedError extends APIError {
  override name = "PermissionDeniedError";
}

export class NotFoundError extends APIError {
  override name = "NotFoundError";
}

export class ConflictError extends APIError {
  override name = "ConflictError";
}

export class UnprocessableEntityError extends APIError {
  override name = "UnprocessableEntityError";
}

export class RateLimitError extends APIError {
  override name = "RateLimitError";
}

export class InternalServerError extends APIError {
  override name = "InternalServerError";
}

export class TimeoutError extends IngotError {
  override name = "TimeoutError";
  constructor(method: string, path: string) {
    super(`Request timed out: ${method} ${path}`);
  }
}
