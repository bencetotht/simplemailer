import { NextRequest } from "next/server";
import { Prisma, Status } from "database";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { canonicalRequestDigest } from "@/lib/idempotency";
import { resetRateLimitsForTests } from "@/lib/rate-limit";

const mocks = vi.hoisted(() => ({
  accountFindUnique: vi.fn(),
  templateFindUnique: vi.fn(),
  logFindUnique: vi.fn(),
  logCreate: vi.fn(),
  logFindUniqueOrThrow: vi.fn(),
  publishLogRecords: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    account: { findUnique: mocks.accountFindUnique },
    template: { findUnique: mocks.templateFindUnique },
    log: {
      findUnique: mocks.logFindUnique,
      create: mocks.logCreate,
      findUniqueOrThrow: mocks.logFindUniqueOrThrow,
    },
  },
}));

vi.mock("@/lib/send-jobs", () => ({
  publishLogRecords: mocks.publishLogRecords,
}));

vi.mock("@/lib/log", () => ({
  logServerError: vi.fn(),
}));

import { POST } from "./route";

const originalApiKey = process.env.DASHBOARD_API_KEY;
const validRequest = {
  accountId: "account-1",
  templateId: "template-1",
  recipient: "reader@example.com",
  values: { name: "Reader" },
};

function request(body = validRequest, idempotencyKey = "send-test-key"): NextRequest {
  return new NextRequest("http://localhost/api/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "test-api-key",
      "idempotency-key": idempotencyKey,
      "x-request-id": "send-route-test",
      "x-correlation-id": "send-correlation-test",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/send reliability boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    process.env.DASHBOARD_API_KEY = "test-api-key";
    mocks.logFindUnique.mockResolvedValue(null);
    mocks.accountFindUnique.mockResolvedValue({ id: validRequest.accountId });
    mocks.templateFindUnique.mockResolvedValue({ id: validRequest.templateId });
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.DASHBOARD_API_KEY;
    else process.env.DASHBOARD_API_KEY = originalApiKey;
  });

  test("returns 409 when an idempotency key is reused with different content", async () => {
    mocks.logFindUnique.mockResolvedValue({
      id: "existing-job",
      status: Status.QUEUED,
      requestDigest: canonicalRequestDigest({ ...validRequest, recipient: "other@example.com" }),
    });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
      requestId: "send-route-test",
    });
    expect(mocks.logCreate).not.toHaveBeenCalled();
  });

  test("handles a concurrent same-key create race as an idempotent replay", async () => {
    const existing = {
      id: "race-winner",
      status: Status.ENQUEUE_PENDING,
      requestDigest: canonicalRequestDigest(validRequest),
    };
    mocks.logFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    mocks.logCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique conflict", {
        code: "P2002",
        clientVersion: "7.8.0",
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      jobId: "race-winner",
      status: Status.ENQUEUE_PENDING,
    });
  });

  test("returns a structured 503 while retaining an enqueue-pending record", async () => {
    const persisted = {
      id: "pending-job",
      status: Status.ENQUEUE_PENDING,
    };
    mocks.logCreate.mockResolvedValue(persisted);
    mocks.publishLogRecords.mockResolvedValue({
      queuedIds: [],
      failedIds: [persisted.id],
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "ENQUEUE_FAILED",
      requestId: "send-route-test",
    });
    expect(mocks.logCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: Status.ENQUEUE_PENDING,
        requestDigest: canonicalRequestDigest(validRequest),
        correlationId: "send-correlation-test",
      }),
    });
  });
});
