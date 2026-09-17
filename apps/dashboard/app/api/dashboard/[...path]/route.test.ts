import { NextRequest } from "next/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dashboard API proxy", () => {
  test("uses the local HTTP listener when the public request is HTTPS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://simplemailer.local.bnbdevelopment.hu/api/dashboard/health?full=true",
      { headers: { "x-forwarded-proto": "https" } },
    );
    const response = await GET(request, {
      params: Promise.resolve({ path: ["health"] }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:3000/api/health?full=true",
    );
  });
});
