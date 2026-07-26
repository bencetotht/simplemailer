import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { LEGACY_API_KEY_HEADER } from "@/lib/legacy-contract";

let hasWarnedMissingApiKey = false;

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function requireApiKey(request: NextRequest): NextResponse | null {
  const expected = process.env.DASHBOARD_API_KEY;
  if (!expected) {
    // Local/dev fallback: keep APIs usable without injecting a key.
    if (process.env.NODE_ENV !== "production") {
      if (!hasWarnedMissingApiKey) {
        hasWarnedMissingApiKey = true;
        console.warn(
          "[auth] DASHBOARD_API_KEY is not configured; allowing unauthenticated API access in non-production mode.",
        );
      }
      return null;
    }

    return apiError(
      request,
      503,
      "AUTH_CONFIGURATION_MISSING",
      "Legacy API authentication is not configured",
    );
  }

  const provided = request.headers.get(LEGACY_API_KEY_HEADER);
  if (!provided || !safeCompare(provided, expected)) {
    return apiError(
      request,
      401,
      "INVALID_API_KEY",
      "A valid x-api-key credential is required",
    );
  }

  return null;
}
