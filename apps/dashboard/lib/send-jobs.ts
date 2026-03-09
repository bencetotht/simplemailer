import { randomUUID } from "crypto";
import { Prisma, Status } from "database";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/log";
import { publishToMailerQueue } from "@/lib/queue";

export interface EnqueueableMailLog {
  id: string;
  accountId: string;
  templateId: string;
  recipient: string;
  values: Prisma.JsonValue | null;
  correlationId?: string | null;
}

export interface PublishLogResult {
  queuedIds: string[];
  failedIds: string[];
}

function asTemplateValues(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function publishLogRecords(logs: EnqueueableMailLog[]): Promise<PublishLogResult> {
  const queuedIds: string[] = [];
  const failedIds: string[] = [];

  for (const log of logs) {
    const correlationId = log.correlationId?.trim() || randomUUID();

    try {
      await publishToMailerQueue({
        jobId: log.id,
        attempt: 0,
        correlationId,
        data: {
          accountId: log.accountId,
          templateId: log.templateId,
          recipient: log.recipient,
          values: asTemplateValues(log.values),
        },
      });

      await prisma.log.update({
        where: { id: log.id },
        data: {
          status: Status.QUEUED,
          lastAttemptAt: new Date(),
          lastError: null,
          failureClass: null,
          correlationId,
        },
      });
      queuedIds.push(log.id);
    } catch (error) {
      logServerError("send_jobs.publish_failed", error, { jobId: log.id });
      await prisma.log.update({
        where: { id: log.id },
        data: {
          lastError: error instanceof Error ? error.message : String(error),
          failureClass: "PUBLISH_CONFIRM_FAILED",
          correlationId,
        },
      });
      failedIds.push(log.id);
    }
  }

  return { queuedIds, failedIds };
}
