import type { NextRequest } from "next/server";

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

interface RateLimitConfig {
  capacity: number;
  refillWindowMs: number;
}

const buckets = new Map<string, TokenBucket>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function refillBucket(bucket: TokenBucket, config: RateLimitConfig, now: number): void {
  const elapsedMs = Math.max(now - bucket.lastRefillAt, 0);
  if (elapsedMs <= 0) return;
  const tokensPerMs = config.capacity / config.refillWindowMs;
  bucket.tokens = Math.min(config.capacity, bucket.tokens + elapsedMs * tokensPerMs);
  bucket.lastRefillAt = now;
}

export function consumeRateLimitToken(
  request: NextRequest,
  scope: string,
  config: RateLimitConfig = { capacity: 60, refillWindowMs: 60_000 },
): { allowed: boolean; retryAfterSeconds: number } {
  const key = `${scope}:${getClientIp(request)}`;
  const now = Date.now();
  const current = buckets.get(key) ?? { tokens: config.capacity, lastRefillAt: now };

  refillBucket(current, config, now);

  if (current.tokens < 1) {
    const tokensPerMs = config.capacity / config.refillWindowMs;
    const missing = 1 - current.tokens;
    const retryAfterSeconds = Math.max(Math.ceil(missing / tokensPerMs / 1000), 1);
    buckets.set(key, current);
    return { allowed: false, retryAfterSeconds };
  }

  current.tokens -= 1;
  buckets.set(key, current);
  return { allowed: true, retryAfterSeconds: 0 };
}
