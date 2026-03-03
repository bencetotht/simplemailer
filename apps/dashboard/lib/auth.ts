import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
    return NextResponse.json(
      { success: false, message: "DASHBOARD_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("x-api-key");
  if (!provided || !safeCompare(provided, expected)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}
