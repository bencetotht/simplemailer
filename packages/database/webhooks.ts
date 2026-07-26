import { randomUUID } from "node:crypto";
import {
  Prisma,
  Status,
  WebhookEndpointStatus,
  WebhookEventType,
} from "./generated/client";

type Transaction = Prisma.TransactionClient;

const STATUS_EVENT_TYPES: Partial<Record<Status, WebhookEventType>> = {
  [Status.ENQUEUE_PENDING]: WebhookEventType.MESSAGE_ACCEPTED,
  [Status.QUEUED]: WebhookEventType.MESSAGE_QUEUED,
  [Status.PROCESSING]: WebhookEventType.MESSAGE_PROCESSING,
  [Status.RETRYING]: WebhookEventType.MESSAGE_RETRYING,
  [Status.SENT]: WebhookEventType.MESSAGE_SENT,
  [Status.FAILED]: WebhookEventType.MESSAGE_FAILED,
  [Status.DEAD]: WebhookEventType.MESSAGE_DEAD,
  [Status.DELIVERY_UNCERTAIN]: WebhookEventType.MESSAGE_DELIVERY_UNCERTAIN,
};

export function webhookEventName(type: WebhookEventType): string {
  if (type === WebhookEventType.MESSAGE_DELIVERY_UNCERTAIN) {
    return "message.delivery_uncertain";
  }
  if (type === WebhookEventType.ENDPOINT_TEST) return "endpoint.test";
  return type.toLowerCase().replace("_", ".");
}

export async function recordMessageWebhookEvent(
  tx: Transaction,
  message: {
    id: string;
    projectId: string;
    correlationId: string;
    status: Status;
    retryCount?: number;
    failureClass?: string | null;
  },
  occurredAt = new Date(),
): Promise<string | null> {
  const type = STATUS_EVENT_TYPES[message.status];
  if (!type) return null;

  const id = `evt_${randomUUID().replaceAll("-", "")}`;
  const payload = {
    id,
    type: webhookEventName(type),
    createdAt: occurredAt.toISOString(),
    data: {
      message: {
        id: message.id,
        status: message.status,
        correlationId: message.correlationId,
        retryCount: message.retryCount ?? 0,
        failureClass: message.failureClass ?? null,
      },
    },
  };
  const endpoints = await tx.webhookEndpoint.findMany({
    where: {
      projectId: message.projectId,
      status: WebhookEndpointStatus.ACTIVE,
      eventTypes: { has: type },
    },
    select: { id: true, url: true, signingSecretEnc: true },
  });
  await tx.webhookEvent.create({
    data: {
      id,
      projectId: message.projectId,
      messageId: message.id,
      type,
      payload,
      occurredAt,
      deliveries: {
        create: endpoints.map((endpoint) => ({
          id: `whd_${randomUUID().replaceAll("-", "")}`,
          endpointId: endpoint.id,
          targetUrl: endpoint.url,
          signingSecretEnc: endpoint.signingSecretEnc,
        })),
      },
    },
  });
  return id;
}
