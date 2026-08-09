import { isIP } from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import type { WebhookEventName } from "@simplemailer/sdk/contracts";
import {
  Prisma,
  WebhookDeliveryStatus,
  WebhookEndpointStatus,
  WebhookEventType,
} from "database";
import { webhookEventName } from "database/webhooks";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";

const EVENT_TYPES: Record<WebhookEventName, WebhookEventType> = {
  "message.accepted": WebhookEventType.MESSAGE_ACCEPTED,
  "message.queued": WebhookEventType.MESSAGE_QUEUED,
  "message.processing": WebhookEventType.MESSAGE_PROCESSING,
  "message.retrying": WebhookEventType.MESSAGE_RETRYING,
  "message.sent": WebhookEventType.MESSAGE_SENT,
  "message.failed": WebhookEventType.MESSAGE_FAILED,
  "message.dead": WebhookEventType.MESSAGE_DEAD,
  "message.delivery_uncertain": WebhookEventType.MESSAGE_DELIVERY_UNCERTAIN,
};

function isPrivateIp(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIp(normalized.slice("::ffff:".length));
  }
  if (isIP(normalized) === 4) {
    const parts = normalized.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      parts[0] === 0
    );
  }
  return (
    isIP(normalized) === 6 &&
    (normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb"))
  );
}

export function normalizeWebhookUrl(input: string): string {
  const url = new URL(input);
  const hostname = url.hostname.toLowerCase();
  const localDevelopment =
    process.env.NODE_ENV !== "production" && (hostname === "localhost" || hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) {
    throw new Error("Webhook URLs must use HTTPS");
  }
  if (url.username || url.password || url.hash) {
    throw new Error("Webhook URLs must not contain credentials or fragments");
  }
  if (
    !localDevelopment &&
    (isPrivateIp(hostname) ||
      hostname === "localhost" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal"))
  ) {
    throw new Error("Webhook URLs must not target local or private network addresses");
  }
  return url.toString();
}

function endpointSummary(endpoint: {
  id: string;
  url: string;
  description: string | null;
  eventTypes: WebhookEventType[];
  status: WebhookEndpointStatus;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: endpoint.id,
    url: endpoint.url,
    description: endpoint.description,
    events: endpoint.eventTypes.map((type) => webhookEventName(type)),
    status: endpoint.status,
    consecutiveFailures: endpoint.consecutiveFailures,
    lastSuccessAt: endpoint.lastSuccessAt,
    lastFailureAt: endpoint.lastFailureAt,
    disabledAt: endpoint.disabledAt,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

function newWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

async function audit(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    actorApiKeyId: string;
    action: string;
    targetId: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await tx.auditEvent.create({
    data: {
      id: `aud_${randomUUID().replaceAll("-", "")}`,
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: input.action,
      targetType: "webhook_endpoint",
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}

export async function listWebhookEndpoints(projectId: string) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return endpoints.map(endpointSummary);
}

export async function createWebhookEndpoint(input: {
  projectId: string;
  actorApiKeyId: string;
  url: string;
  description?: string;
  events: WebhookEventName[];
}) {
  const secret = newWebhookSecret();
  const endpoint = await prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        id: `whe_${randomUUID().replaceAll("-", "")}`,
        projectId: input.projectId,
        url: normalizeWebhookUrl(input.url),
        description: input.description,
        eventTypes: input.events.map((event) => EVENT_TYPES[event]),
        signingSecretEnc: encryptSecret(secret),
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "webhook.endpoint.created",
      targetId: created.id,
      metadata: { events: input.events },
    });
    return created;
  });
  return { endpoint: endpointSummary(endpoint), secret };
}

export async function updateWebhookEndpoint(input: {
  projectId: string;
  actorApiKeyId: string;
  id: string;
  url?: string;
  description?: string | null;
  events?: WebhookEventName[];
  status?: "ACTIVE" | "PAUSED";
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.webhookEndpoint.findFirst({
      where: { id: input.id, projectId: input.projectId },
    });
    if (!existing) return null;
    const endpoint = await tx.webhookEndpoint.update({
      where: { id: existing.id },
      data: {
        ...(input.url === undefined ? {} : { url: normalizeWebhookUrl(input.url) }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.events === undefined
          ? {}
          : { eventTypes: input.events.map((event) => EVENT_TYPES[event]) }),
        ...(input.status === undefined
          ? {}
          : {
              status: input.status,
              disabledAt: null,
              ...(input.status === "ACTIVE" ? { consecutiveFailures: 0 } : {}),
            }),
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "webhook.endpoint.updated",
      targetId: endpoint.id,
    });
    return endpointSummary(endpoint);
  });
}

export async function rotateWebhookSecret(input: {
  projectId: string;
  actorApiKeyId: string;
  id: string;
}) {
  const secret = newWebhookSecret();
  const overlapUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endpoint = await prisma.$transaction(async (tx) => {
    const existing = await tx.webhookEndpoint.findFirst({
      where: { id: input.id, projectId: input.projectId },
    });
    if (!existing) return null;
    const updated = await tx.webhookEndpoint.update({
      where: { id: existing.id },
      data: {
        previousSecretEnc: existing.signingSecretEnc,
        previousSecretExpiresAt: overlapUntil,
        signingSecretEnc: encryptSecret(secret),
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "webhook.secret.rotated",
      targetId: existing.id,
      metadata: { overlapUntil: overlapUntil.toISOString() },
    });
    return updated;
  });
  return endpoint ? { endpoint: endpointSummary(endpoint), secret, overlapUntil } : null;
}

export async function testWebhookEndpoint(input: {
  projectId: string;
  actorApiKeyId: string;
  id: string;
}) {
  return prisma.$transaction(async (tx) => {
    const endpoint = await tx.webhookEndpoint.findFirst({
      where: {
        id: input.id,
        projectId: input.projectId,
        status: WebhookEndpointStatus.ACTIVE,
      },
    });
    if (!endpoint) return null;
    const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const occurredAt = new Date();
    const deliveryId = `whd_${randomUUID().replaceAll("-", "")}`;
    await tx.webhookEvent.create({
      data: {
        id: eventId,
        projectId: input.projectId,
        type: WebhookEventType.ENDPOINT_TEST,
        occurredAt,
        payload: {
          id: eventId,
          type: "endpoint.test",
          createdAt: occurredAt.toISOString(),
          data: { endpoint: { id: endpoint.id } },
        },
        deliveries: {
          create: {
            id: deliveryId,
            endpointId: endpoint.id,
            targetUrl: endpoint.url,
            signingSecretEnc: endpoint.signingSecretEnc,
          },
        },
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "webhook.endpoint.tested",
      targetId: endpoint.id,
      metadata: { eventId },
    });
    return { eventId, deliveryId, status: WebhookDeliveryStatus.PENDING };
  });
}

export async function replayWebhookEvent(input: {
  projectId: string;
  actorApiKeyId: string;
  eventId: string;
  endpointId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [event, endpoint] = await Promise.all([
      tx.webhookEvent.findFirst({ where: { id: input.eventId, projectId: input.projectId } }),
      tx.webhookEndpoint.findFirst({
        where: {
          id: input.endpointId,
          projectId: input.projectId,
          status: WebhookEndpointStatus.ACTIVE,
        },
      }),
    ]);
    if (!event || !endpoint) return null;
    const deliveryId = `whd_${randomUUID().replaceAll("-", "")}`;
    const delivery = await tx.webhookDelivery.create({
      data: {
        id: deliveryId,
        eventId: event.id,
        endpointId: endpoint.id,
        targetUrl: endpoint.url,
        signingSecretEnc: endpoint.signingSecretEnc,
      },
    });
    await audit(tx, {
      projectId: input.projectId,
      actorApiKeyId: input.actorApiKeyId,
      action: "webhook.event.replayed",
      targetId: endpoint.id,
      metadata: { eventId: event.id, deliveryId: delivery.id },
    });
    return { eventId: event.id, deliveryId: delivery.id, status: WebhookDeliveryStatus.PENDING };
  });
}
