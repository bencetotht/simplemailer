CREATE TYPE "public"."WebhookEventType" AS ENUM (
  'MESSAGE_ACCEPTED',
  'MESSAGE_QUEUED',
  'MESSAGE_PROCESSING',
  'MESSAGE_RETRYING',
  'MESSAGE_SENT',
  'MESSAGE_FAILED',
  'MESSAGE_DEAD',
  'MESSAGE_DELIVERY_UNCERTAIN',
  'ENDPOINT_TEST'
);

CREATE TYPE "public"."WebhookEndpointStatus" AS ENUM ('ACTIVE', 'PAUSED', 'DISABLED');
CREATE TYPE "public"."WebhookDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "public"."WebhookEndpoint" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT,
  "signingSecretEnc" TEXT NOT NULL,
  "previousSecretEnc" TEXT,
  "previousSecretExpiresAt" TIMESTAMP(3),
  "eventTypes" "public"."WebhookEventType"[] NOT NULL,
  "status" "public"."WebhookEndpointStatus" NOT NULL DEFAULT 'ACTIVE',
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."WebhookEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "messageId" TEXT,
  "type" "public"."WebhookEventType" NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."WebhookDelivery" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "endpointId" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "signingSecretEnc" TEXT NOT NULL,
  "status" "public"."WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "responseStatus" INTEGER,
  "responseSummary" TEXT,
  "lastError" TEXT,
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."AuditEvent" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "actorApiKeyId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEndpoint_projectId_status_idx" ON "public"."WebhookEndpoint"("projectId", "status");
CREATE INDEX "WebhookEvent_projectId_occurredAt_idx" ON "public"."WebhookEvent"("projectId", "occurredAt");
CREATE INDEX "WebhookEvent_messageId_occurredAt_idx" ON "public"."WebhookEvent"("messageId", "occurredAt");
CREATE INDEX "WebhookDelivery_eventId_endpointId_idx" ON "public"."WebhookDelivery"("eventId", "endpointId");
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "public"."WebhookDelivery"("status", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_endpointId_createdAt_idx" ON "public"."WebhookDelivery"("endpointId", "createdAt");
CREATE INDEX "AuditEvent_projectId_occurredAt_idx" ON "public"."AuditEvent"("projectId", "occurredAt");
CREATE INDEX "AuditEvent_targetType_targetId_idx" ON "public"."AuditEvent"("targetType", "targetId");

ALTER TABLE "public"."WebhookEndpoint"
  ADD CONSTRAINT "WebhookEndpoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."WebhookEvent"
  ADD CONSTRAINT "WebhookEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."WebhookEvent"
  ADD CONSTRAINT "WebhookEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "public"."WebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "public"."WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."AuditEvent"
  ADD CONSTRAINT "AuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
