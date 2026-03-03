const REDACT_KEYS = ['password', 'secret', 'authorization', 'x-api-key', 'token', 'accesskey'];

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((token) => lower.includes(token));
}

export function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    output[key] = shouldRedact(key) ? '[REDACTED]' : redactValue(child);
  }
  return output;
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

export function logRedactedError(context: string, error: unknown, meta?: Record<string, unknown>): void {
  const payload = {
    context,
    error: serializeError(error),
    ...(meta ? { meta: redactValue(meta) } : {}),
  };
  console.error(JSON.stringify(payload));
}
