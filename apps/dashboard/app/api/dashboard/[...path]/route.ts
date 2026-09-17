import { NextRequest, NextResponse } from "next/server";
import {
  allowUnauthenticatedLocalDashboard,
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionConfigured,
  verifyDashboardSession,
} from "@/lib/dashboard-session";
import { apiError } from "@/lib/http";

const DASHBOARD_INTERNAL_API_URL =
  process.env.DASHBOARD_INTERNAL_API_URL ||
  `http://127.0.0.1:${process.env.PORT || "3000"}`;

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  if (!allowUnauthenticatedLocalDashboard()) {
    if (!dashboardSessionConfigured()) {
      return apiError(
        request,
        503,
        "AUTH_CONFIGURATION_MISSING",
        "Dashboard authentication is not configured",
      );
    }
    const authenticated = await verifyDashboardSession(
      request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value,
      process.env.DASHBOARD_SESSION_SECRET!,
    );
    if (!authenticated) {
      return apiError(request, 401, "DASHBOARD_SESSION_REQUIRED", "Dashboard session required");
    }
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      const origin = request.headers.get("origin");
      if (origin !== request.nextUrl.origin) {
        return apiError(request, 403, "INVALID_REQUEST_ORIGIN", "Dashboard request origin is invalid");
      }
    }
  }

  const apiKey = process.env.DASHBOARD_API_KEY;
  if (process.env.NODE_ENV === "production" && !apiKey) {
    return apiError(
      request,
      503,
      "AUTH_CONFIGURATION_MISSING",
      "Legacy API authentication is not configured",
    );
  }

  const { path } = await context.params;
  const target = new URL(
    `/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    DASHBOARD_INTERNAL_API_URL,
  );
  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("host");
  headers.delete("content-length");
  if (apiKey) headers.set("x-api-key", apiKey);

  const hasBody = !["GET", "HEAD"].includes(request.method);
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: "manual",
    ...(hasBody ? { duplex: "half" } : {}),
  };
  const upstream = await fetch(target, init);
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("set-cookie");
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
