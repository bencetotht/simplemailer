-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "retryCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Log_createdAt_idx" ON "Log"("createdAt");

-- CreateIndex
CREATE INDEX "Log_status_createdAt_idx" ON "Log"("status", "createdAt");
