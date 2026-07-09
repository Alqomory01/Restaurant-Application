export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `Request failed with status ${status}`;
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Thrown when fetch itself fails (dropped wifi, DNS, server unreachable) —
 * distinct from ApiError, which means the server responded but said no. */
export class NetworkError extends Error {
  constructor() {
    super("Can't reach the server. Check your connection and try again.");
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof NetworkError || err instanceof ApiError) return err.message;
  return fallback;
}
