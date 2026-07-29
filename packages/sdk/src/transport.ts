import { apiErrorSchema } from "@simplemailer/contracts";
import { SimpleMailerError } from "./errors.js";
import { SDK_USER_AGENT } from "./version.js";

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  idempotencyKey?: string;
  retry?: boolean | RetryOptions;
}

export interface TransportRequest<TBody = unknown> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: TBody;
  options?: RequestOptions;
}

export interface HttpTransport {
  request<TResponse>(request: TransportRequest): Promise<TResponse>;
}

export interface FetchTransportOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  userAgent?: string;
}

function retryAfterMs(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

function retryConfiguration(
  method: TransportRequest["method"],
  options: RequestOptions | undefined,
): Required<RetryOptions> {
  const requested = options?.retry;
  const safeToRetry =
    (method !== "POST" && method !== "PATCH") || Boolean(options?.idempotencyKey);
  if (!requested || !safeToRetry) {
    return { maxAttempts: 1, initialDelayMs: 200, maxDelayMs: 2_000 };
  }
  const value = requested === true ? {} : requested;
  return {
    maxAttempts: Math.max(1, Math.min(value.maxAttempts ?? 3, 5)),
    initialDelayMs: Math.max(0, value.initialDelayMs ?? 200),
    maxDelayMs: Math.max(0, value.maxDelayMs ?? 2_000),
  };
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class FetchTransport implements HttpTransport {
  readonly #baseUrl: string;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #userAgent: string;

  constructor(options: FetchTransportOptions) {
    if (typeof process === "undefined" || !process.versions?.node) {
      throw new SimpleMailerError(
        "Authenticated SimpleMailer clients are supported only in a Node.js server runtime",
        { code: "UNSUPPORTED_RUNTIME" },
      );
    }
    if (!options.apiKey.trim()) {
      throw new SimpleMailerError("apiKey must not be empty", { code: "INVALID_CONFIGURATION" });
    }
    const url = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new SimpleMailerError("baseUrl must use HTTP or HTTPS", {
        code: "INVALID_CONFIGURATION",
      });
    }
    this.#baseUrl = url.toString().replace(/\/$/, "");
    this.#apiKey = options.apiKey;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#userAgent = options.userAgent ?? SDK_USER_AGENT;
  }

  async request<TResponse>(request: TransportRequest): Promise<TResponse> {
    const retry = retryConfiguration(request.method, request.options);
    let lastError: unknown;
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      try {
        return await this.#requestOnce<TResponse>(request);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof SimpleMailerError
            ? error.retryable
            : !request.options?.signal?.aborted;
        if (!retryable || attempt === retry.maxAttempts) throw error;
        const backoff = Math.min(
          retry.maxDelayMs,
          retry.initialDelayMs * 2 ** (attempt - 1),
        );
        const serverDelay =
          error instanceof SimpleMailerError ? error.retryAfterMs : undefined;
        await delay(Math.max(backoff, serverDelay ?? 0), request.options?.signal);
      }
    }
    throw lastError;
  }

  async #requestOnce<TResponse>(request: TransportRequest): Promise<TResponse> {
    const controller = new AbortController();
    const timeoutMs = request.options?.timeoutMs ?? this.#timeoutMs;
    let timedOut = false;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
      },
      timeoutMs,
    );
    const externalSignal = request.options?.signal;
    const onExternalAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const headers = new Headers({
        accept: "application/json",
        authorization: `Bearer ${this.#apiKey}`,
        "user-agent": this.#userAgent,
      });
      if (request.body !== undefined) headers.set("content-type", "application/json");
      if (request.options?.idempotencyKey) {
        headers.set("idempotency-key", request.options.idempotencyKey);
      }
      let response: Response;
      try {
        response = await this.#fetch(`${this.#baseUrl}${request.path}`, {
          method: request.method,
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
          signal: controller.signal,
        });
      } catch (cause) {
        const aborted = controller.signal.aborted;
        throw new SimpleMailerError(
          timedOut
            ? `SimpleMailer request timed out after ${timeoutMs}ms`
            : aborted
              ? "SimpleMailer request was aborted"
              : "Could not reach SimpleMailer",
          {
            code: timedOut ? "REQUEST_TIMEOUT" : aborted ? "REQUEST_ABORTED" : "NETWORK_ERROR",
            cause,
          },
        );
      }

      const text = await response.text();
      const payload = text ? parseJson(text, response.status) : undefined;
      if (!response.ok) {
        const parsed = apiErrorSchema.safeParse(payload);
        const requestId = parsed.success
          ? parsed.data.requestId
          : response.headers.get("x-request-id") ?? undefined;
        const retryDelay = retryAfterMs(response.headers.get("retry-after"));
        throw new SimpleMailerError(
          parsed.success ? parsed.data.message : `SimpleMailer returned HTTP ${response.status}`,
          {
            status: response.status,
            code: parsed.success ? parsed.data.code : "HTTP_ERROR",
            details: parsed.success ? parsed.data.details : payload,
            ...(requestId === undefined ? {} : { requestId }),
            ...(retryDelay === undefined ? {} : { retryAfterMs: retryDelay }),
          },
        );
      }
      return payload as TResponse;
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }
}

function parseJson(text: string, status: number): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new SimpleMailerError(`SimpleMailer returned invalid JSON for HTTP ${status}`, {
      status,
      code: "INVALID_RESPONSE",
      cause,
    });
  }
}
