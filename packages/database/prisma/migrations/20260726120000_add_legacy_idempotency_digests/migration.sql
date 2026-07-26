-- Phase 1 additive idempotency hardening. Existing rows intentionally remain
-- NULL so their historical replay behavior is preserved.
ALTER TABLE "Log" ADD COLUMN "requestDigest" TEXT;
ALTER TABLE "BulkSendBatch" ADD COLUMN "requestDigest" TEXT;
