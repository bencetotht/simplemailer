import { randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const JSON_LIMITS = {
  controlPlane: 256 * 1024,
  send: 1024 * 1024,
  bulkSend: 4 * 1024 * 1024,
} as const;

export interface RequestMetadata {
  requestId: string;
  correlationId: string;
}

export interface LegacyErrorEnvelope {
  success: false;
  code: string;
  message: string;
  requestId: string;
  details?: unknown;
  /** Temporary aliases retained for existing legacy clients. */
  error?: string;
  fields?: unknown;
  [key: string]: unknown;
}

const SAFE_METADATA_VALUE = /^[A-Za-z0-9._:/-]{1,128}$/;
const requestMetadata = new WeakMap<NextRequest, RequestMetadata>();

function safeMetadataValue(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return SAFE_METADATA_VALUE.test(normalized) ? normalized : null;
}

export function getRequestMetadata(request: NextRequest): RequestMetadata {
  const existing = requestMetadata.get(request);
  if (existing) return existing;
  const requestId = safeMetadataValue(request.headers.get("x-request-id")) ?? randomUUID();
  const correlationId =
    safeMetadataValue(request.headers.get("x-correlation-id")) ?? requestId;
  const metadata = { requestId, correlationId };
  requestMetadata.set(request, metadata);
  return metadata;
}

export function apiError(
  request: NextRequest,
  status: number,
  code: string,
  message: string,
  options: {
    details?: unknown;
    headers?: HeadersInit;
    compatibilityFields?: Record<string, unknown>;
  } = {},
): NextResponse<LegacyErrorEnvelope> {
  const { requestId } = getRequestMetadata(request);
  return NextResponse.json(
    {
      ...options.compatibilityFields,
      success: false,
      code,
      message,
      requestId,
      ...(options.details === undefined ? {} : { details: options.details }),
      error: code === "VALIDATION_FAILED" ? "Validation failed" : message,
      ...(code === "VALIDATION_FAILED" && options.details !== undefined
        ? { fields: options.details }
        : {}),
    },
    {
      status,
      headers: {
        "x-request-id": requestId,
        ...Object.fromEntries(new Headers(options.headers).entries()),
      },
    },
  );
}

export function jsonResponse(
  request: NextRequest,
  body: unknown,
  init: ResponseInit = {},
): NextResponse {
  const { requestId } = getRequestMetadata(request);
  const headers = new Headers(init.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.json(body, { ...init, headers });
}

export type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; response: NextResponse<LegacyErrorEnvelope> };

export async function readJsonBody(
  request: NextRequest,
  maxBytes: number,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      return {
        ok: false,
        response: apiError(
          request,
          413,
          "REQUEST_TOO_LARGE",
          `JSON request body must not exceed ${maxBytes} bytes`,
        ),
      };
    }
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: apiError(request, 400, "MALFORMED_JSON", "Request body must be valid JSON"),
    };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      return {
        ok: false,
        response: apiError(
          request,
          413,
          "REQUEST_TOO_LARGE",
          `JSON request body must not exceed ${maxBytes} bytes`,
        ),
      };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return {
      ok: false,
      response: apiError(request, 400, "MALFORMED_JSON", "Request body must be valid JSON"),
    };
  }
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
