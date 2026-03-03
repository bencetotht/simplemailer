-- Status enum extensions for hardened queue lifecycle
ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'ENQUEUE_PENDING';
ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'RETRYING';
ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'DEAD';

-- Account secret hardening: encrypted writes with legacy fallback
ALTER TABLE "public"."Account"
  ADD COLUMN IF NOT EXISTS "passwordEnc" TEXT,
  ALTER COLUMN "password" DROP NOT NULL;

-- Bucket secret hardening: encrypted writes with legacy fallback
ALTER TABLE "public"."Bucket"
  ADD COLUMN IF NOT EXISTS "accessKeyIdEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "secretAccessKeyEnc" TEXT,
  ALTER COLUMN "accessKeyId" DROP NOT NULL,
  ALTER COLUMN "secretAccessKey" DROP NOT NULL;

-- Log lifecycle and enqueue idempotency metadata
ALTER TABLE "public"."Log"
  ADD COLUMN IF NOT EXISTS "enqueueKey" TEXT,
  ADD COLUMN IF NOT EXISTS "correlationId" TEXT,
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "failureClass" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Log_enqueueKey_key" ON "public"."Log"("enqueueKey");
