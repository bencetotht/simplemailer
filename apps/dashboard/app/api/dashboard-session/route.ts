import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  createDashboardSession,
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_MAX_AGE_SECONDS,
  dashboardSessionConfigured,
} from "@/lib/dashboard-session";
import { apiError, JSON_LIMITS, readJsonBody } from "@/lib/http";

function matchesPassword(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  if (!dashboardSessionConfigured()) {
    return apiError(
      request,
      503,
      "AUTH_CONFIGURATION_MISSING",
      "Dashboard authentication is not configured",
    );
  }

  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const password =
    body.value && typeof body.value === "object" && !Array.isArray(body.value)
      ? (body.value as Record<string, unknown>).password
      : undefined;
  if (typeof password !== "string" || !matchesPassword(password, process.env.DASHBOARD_PASSWORD!)) {
    return apiError(request, 401, "INVALID_DASHBOARD_CREDENTIALS", "Invalid dashboard password");
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: await createDashboardSession(process.env.DASHBOARD_SESSION_SECRET!),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DASHBOARD_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: DASHBOARD_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
