import { NextRequest } from "next/server";
import { Status } from "database";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProjectScope: vi.fn(),
  acceptInlineMessage: vi.fn(),
  publishMessageRecord: vi.fn(),
}));

vi.mock("@/lib/v1-auth", () => ({ requireProjectScope: mocks.requireProjectScope }));
vi.mock("@/lib/v1-messages", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/v1-messages")>();
  return { ...actual, acceptInlineMessage: mocks.acceptInlineMessage };
});
vi.mock("@/lib/v1-send-jobs", () => ({ publishMessageRecord: mocks.publishMessageRecord }));

import { POST } from "./route";

const body = {
  sender: "transactional",
  to: "reader@example.com",
  subject: "Welcome",
  content: { html: "<h1>Hello</h1>", text: "Hello" },
  tags: { kind: "welcome" },
};

function request(input = body): NextRequest {
  return new NextRequest("http://localhost/v1/messages", {
    method: "POST",
    headers: {
      authorization: "Bearer test",
      "content-type": "application/json",
      "idempotency-key": "welcome-1",
      "x-request-id": "request-1",
      "x-correlation-id": "correlation-1",
    },
    body: JSON.stringify(input),
  });
}

describe("POST /v1/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProjectScope.mockResolvedValue({
      ok: true,
      principal: { projectId: "project-1" },
    });
    mocks.acceptInlineMessage.mockResolvedValue({
      kind: "accepted",
      message: {
        id: "msg_1",
        status: Status.ENQUEUE_PENDING,
        sender: body.sender,
        to: body.to,
        subject: body.subject,
        tags: body.tags,
        acceptedAt: new Date(),
        queuedAt: null,
        completedAt: null,
        failureClass: null,
        lastError: null,
      },
    });
    mocks.publishMessageRecord.mockResolvedValue(true);
  });

  test("scopes acceptance to the authenticated project and publishes only the message ID", async () => {
    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.requireProjectScope).toHaveBeenCalledWith(expect.anything(), "messages:send");
    expect(mocks.acceptInlineMessage).toHaveBeenCalledWith({
      projectId: "project-1",
      body,
      idempotencyKey: "welcome-1",
      requestId: "request-1",
      correlationId: "correlation-1",
    });
    expect(mocks.publishMessageRecord).toHaveBeenCalledWith({
      id: "msg_1",
      correlationId: "correlation-1",
      requestId: "request-1",
      idempotencyKey: "welcome-1",
    });
    await expect(response.json()).resolves.toMatchObject({
      data: { id: "msg_1", status: Status.QUEUED },
    });
  });

  test("replays an accepted message without publishing it twice", async () => {
    mocks.acceptInlineMessage.mockResolvedValue({
      kind: "replay",
      message: {
        id: "msg_existing",
        status: Status.ENQUEUE_PENDING,
        sender: body.sender,
        to: body.to,
        subject: body.subject,
        tags: {},
        acceptedAt: new Date(),
        queuedAt: null,
        completedAt: null,
        failureClass: null,
        lastError: null,
      },
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.publishMessageRecord).not.toHaveBeenCalled();
  });

  test("rejects arrays instead of silently combining recipient delivery state", async () => {
    const response = await POST(request({ ...body, to: ["one@example.com", "two@example.com"] } as never));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(mocks.acceptInlineMessage).not.toHaveBeenCalled();
  });
});
