ALTER TABLE "public"."Account"
  ADD COLUMN IF NOT EXISTS "bulkNextAvailableAt" TIMESTAMP(3);

ALTER TABLE "public"."Log"
  ADD COLUMN IF NOT EXISTS "bulkBatchId" TEXT,
  ADD COLUMN IF NOT EXISTS "bulkItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "public"."BulkSendBatch" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "sharedValues" JSONB NOT NULL DEFAULT '{}',
  "requestedCount" INTEGER NOT NULL,
  "acceptedCount" INTEGER NOT NULL,
  "rejectedCount" INTEGER NOT NULL,
  "enqueueKey" TEXT,
  "correlationId" TEXT,
  "requestedMinDelayMs" INTEGER,
  "effectiveMinDelayMs" INTEGER NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkSendBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BulkSendItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "recipient" TEXT NOT NULL,
  "values" JSONB NOT NULL DEFAULT '{}',
  "validationError" TEXT,
  "logId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BulkSendItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BulkSendBatch_enqueueKey_key" ON "public"."BulkSendBatch"("enqueueKey");
CREATE UNIQUE INDEX IF NOT EXISTS "Log_bulkItemId_key" ON "public"."Log"("bulkItemId");
CREATE INDEX IF NOT EXISTS "BulkSendBatch_createdAt_idx" ON "public"."BulkSendBatch"("createdAt");
CREATE INDEX IF NOT EXISTS "BulkSendBatch_accountId_createdAt_idx" ON "public"."BulkSendBatch"("accountId", "createdAt");
CREATE INDEX IF NOT EXISTS "BulkSendItem_batchId_sequence_idx" ON "public"."BulkSendItem"("batchId", "sequence");
CREATE INDEX IF NOT EXISTS "BulkSendItem_batchId_validationError_idx" ON "public"."BulkSendItem"("batchId", "validationError");
CREATE INDEX IF NOT EXISTS "Log_status_scheduledFor_createdAt_idx" ON "public"."Log"("status", "scheduledFor", "createdAt");
CREATE INDEX IF NOT EXISTS "Log_bulkBatchId_idx" ON "public"."Log"("bulkBatchId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'BulkSendBatch_accountId_fkey'
      AND table_name = 'BulkSendBatch'
  ) THEN
    ALTER TABLE "public"."BulkSendBatch"
      ADD CONSTRAINT "BulkSendBatch_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'BulkSendBatch_templateId_fkey'
      AND table_name = 'BulkSendBatch'
  ) THEN
    ALTER TABLE "public"."BulkSendBatch"
      ADD CONSTRAINT "BulkSendBatch_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "public"."Template"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'BulkSendItem_batchId_fkey'
      AND table_name = 'BulkSendItem'
  ) THEN
    ALTER TABLE "public"."BulkSendItem"
      ADD CONSTRAINT "BulkSendItem_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "public"."BulkSendBatch"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Log_bulkBatchId_fkey'
      AND table_name = 'Log'
  ) THEN
    ALTER TABLE "public"."Log"
      ADD CONSTRAINT "Log_bulkBatchId_fkey"
      FOREIGN KEY ("bulkBatchId") REFERENCES "public"."BulkSendBatch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Log_bulkItemId_fkey'
      AND table_name = 'Log'
  ) THEN
    ALTER TABLE "public"."Log"
      ADD CONSTRAINT "Log_bulkItemId_fkey"
      FOREIGN KEY ("bulkItemId") REFERENCES "public"."BulkSendItem"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
