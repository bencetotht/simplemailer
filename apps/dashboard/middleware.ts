import { NextRequest, NextResponse } from "next/server";
import {
  allowUnauthenticatedLocalDashboard,
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionConfigured,
  verifyDashboardSession,
} from "@/lib/dashboard-session";

const INGRESS_MAX_BODY_BYTES = 4 * 1024 * 1024;

function isExcluded(pathname: string): boolean {
  return (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/api/health" ||
    pathname === "/api/dashboard-session" ||
    pathname.startsWith("/v1/") ||
    (pathname.startsWith("/api/") && !pathname.startsWith("/api/dashboard/"))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > INGRESS_MAX_BODY_BYTES) {
      const requestId = request.headers.get("x-request-id")?.slice(0, 128) || crypto.randomUUID();
      return NextResponse.json(
        {
          success: false,
          code: "REQUEST_TOO_LARGE",
          message: `Request body must not exceed ${INGRESS_MAX_BODY_BYTES} bytes`,
          requestId,
        },
        { status: 413, headers: { "x-request-id": requestId } },
      );
    }
  }
  if (isExcluded(pathname)) return NextResponse.next();

  if (allowUnauthenticatedLocalDashboard()) return NextResponse.next();

  if (!dashboardSessionConfigured()) {
    return new NextResponse("Dashboard authentication is not configured", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const secret = process.env.DASHBOARD_SESSION_SECRET!;
  const authenticated = await verifyDashboardSession(
    request.cookies.get(DASHBOARD_SESSION_COOKIE)?.value,
    secret,
  );

  if (pathname === "/login") {
    return authenticated
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }
  if (authenticated) return NextResponse.next();

  if (pathname.startsWith("/api/dashboard/")) {
    return NextResponse.json(
      { success: false, code: "DASHBOARD_SESSION_REQUIRED", message: "Dashboard session required" },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
