CREATE TYPE "public"."ProjectStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "public"."SenderStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "public"."ArtifactFormat" AS ENUM ('HTML', 'TEXT', 'MJML');

CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultRetentionDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Sender" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "replyTo" TEXT,
    "accountId" TEXT NOT NULL,
    "status" "public"."SenderStatus" NOT NULL DEFAULT 'ACTIVE',
    "verifiedAt" TIMESTAMP(3),
    "maxConcurrency" INTEGER,
    "maxPerMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Sender_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ContentArtifact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "format" "public"."ArtifactFormat" NOT NULL,
    "byteLength" INTEGER NOT NULL,
    "content" TEXT,
    "objectKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentArtifact_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentArtifact_storage_check" CHECK (("content" IS NOT NULL) <> ("objectKey" IS NOT NULL))
);

CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "resolvedFrom" TEXT NOT NULL,
    "resolvedReplyTo" TEXT,
    "subject" TEXT NOT NULL,
    "htmlArtifactId" TEXT NOT NULL,
    "textArtifactId" TEXT,
    "tags" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "requestDigest" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "public"."Status" NOT NULL DEFAULT 'ENQUEUE_PENDING',
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "processingOwner" TEXT,
    "processingLeaseExpiresAt" TIMESTAMP(3),
    "deliveryAttemptStartedAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "lastError" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "retentionUntil" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Project_slug_key" ON "public"."Project"("slug");
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "public"."ApiKey"("prefix");
CREATE INDEX "ApiKey_projectId_revokedAt_idx" ON "public"."ApiKey"("projectId", "revokedAt");
CREATE UNIQUE INDEX "Sender_projectId_alias_key" ON "public"."Sender"("projectId", "alias");
CREATE INDEX "Sender_accountId_idx" ON "public"."Sender"("accountId");
CREATE UNIQUE INDEX "ContentArtifact_projectId_digest_format_key" ON "public"."ContentArtifact"("projectId", "digest", "format");
CREATE INDEX "ContentArtifact_projectId_createdAt_idx" ON "public"."ContentArtifact"("projectId", "createdAt");
CREATE UNIQUE INDEX "Message_projectId_idempotencyKey_key" ON "public"."Message"("projectId", "idempotencyKey");
CREATE INDEX "Message_projectId_status_createdAt_idx" ON "public"."Message"("projectId", "status", "createdAt");
CREATE INDEX "Message_status_createdAt_idx" ON "public"."Message"("status", "createdAt");
CREATE INDEX "Message_status_processingLeaseExpiresAt_idx" ON "public"."Message"("status", "processingLeaseExpiresAt");
CREATE INDEX "Message_senderId_idx" ON "public"."Message"("senderId");
CREATE INDEX "Message_htmlArtifactId_idx" ON "public"."Message"("htmlArtifactId");
CREATE INDEX "Message_textArtifactId_idx" ON "public"."Message"("textArtifactId");

ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Sender" ADD CONSTRAINT "Sender_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Sender" ADD CONSTRAINT "Sender_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ContentArtifact" ADD CONSTRAINT "ContentArtifact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."Sender"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_htmlArtifactId_fkey" FOREIGN KEY ("htmlArtifactId") REFERENCES "public"."ContentArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_textArtifactId_fkey" FOREIGN KEY ("textArtifactId") REFERENCES "public"."ContentArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
