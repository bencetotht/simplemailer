export interface SimpleMailerErrorOptions {
  status?: number;
  code: string;
  details?: unknown;
  requestId?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class SimpleMailerError extends Error {
  readonly status: number | undefined;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: SimpleMailerErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SimpleMailerError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
    this.requestId = options.requestId;
    this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    return (
      this.code === "NETWORK_ERROR" ||
      this.code === "REQUEST_TIMEOUT" ||
      this.status === 429 ||
      this.status === 500 ||
      this.status === 502 ||
      this.status === 503 ||
      this.status === 504
    );
  }
}
