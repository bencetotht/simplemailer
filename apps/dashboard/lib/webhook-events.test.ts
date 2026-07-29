import { Status, WebhookEventType } from "database";
import { describe, expect, test, vi } from "vitest";
import { recordMessageWebhookEvent } from "database/webhooks";

describe("transactional webhook events", () => {
  test("creates sanitized immutable payloads and snapshots delivery secrets and URLs", async () => {
    const create = vi.fn().mockResolvedValue({});
    const tx = {
      webhookEndpoint: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "whe_1",
            url: "https://hooks.example.com/simplemailer",
            signingSecretEnc: "enc:v1:snapshot",
          },
        ]),
      },
      webhookEvent: { create },
    };

    await recordMessageWebhookEvent(tx as never, {
      id: "msg_1",
      projectId: "project-1",
      correlationId: "correlation-1",
      status: Status.SENT,
      retryCount: 2,
      failureClass: null,
    });

    expect(tx.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        projectId: "project-1",
        status: "ACTIVE",
        eventTypes: { has: WebhookEventType.MESSAGE_SENT },
      },
      select: { id: true, url: true, signingSecretEnc: true },
    });
    const event = create.mock.calls[0]?.[0].data;
    expect(event.payload).toMatchObject({
      type: "message.sent",
      data: {
        message: {
          id: "msg_1",
          status: Status.SENT,
          correlationId: "correlation-1",
          retryCount: 2,
        },
      },
    });
    expect(event.payload.data.message).not.toHaveProperty("recipient");
    expect(event.deliveries.create[0]).toMatchObject({
      endpointId: "whe_1",
      targetUrl: "https://hooks.example.com/simplemailer",
      signingSecretEnc: "enc:v1:snapshot",
    });
  });
});
