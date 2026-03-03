const REDACT_KEYS = ['password', 'secret', 'authorization', 'x-api-key', 'token', 'accesskey'];

function shouldRedact(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACT_KEYS.some((token) => lower.includes(token));
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(input)) {
    output[key] = shouldRedact(key) ? '[REDACTED]' : redact(child);
  }
  return output;
}

export function logServerError(context: string, error: unknown, meta?: Record<string, unknown>): void {
  const payload = {
    context,
    error: error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) },
    ...(meta ? { meta: redact(meta) } : {}),
  };
  console.error(JSON.stringify(payload));
}
