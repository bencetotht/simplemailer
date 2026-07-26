ALTER TYPE "public"."Status" ADD VALUE IF NOT EXISTS 'DELIVERY_UNCERTAIN';

ALTER TABLE "public"."Log"
  ADD COLUMN IF NOT EXISTS "processingOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "processingLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryAttemptStartedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Log_status_processingLeaseExpiresAt_idx"
  ON "public"."Log"("status", "processingLeaseExpiresAt");
