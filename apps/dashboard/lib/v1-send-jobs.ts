import { Status } from "database";
import { prisma } from "@/lib/db";
import { logServerError } from "@/lib/log";
import { publishToMailerQueueV3 } from "@/lib/queue";

export async function publishMessageRecord(message: {
  id: string;
  correlationId: string;
  requestId?: string | null;
  idempotencyKey?: string | null;
}): Promise<boolean> {
  try {
    await publishToMailerQueueV3({
      version: 3,
      messageId: message.id,
      attempt: 0,
      correlationId: message.correlationId,
    });
    await prisma.message.updateMany({
      where: { id: message.id, status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] } },
      data: {
        status: Status.QUEUED,
        queuedAt: new Date(),
        lastAttemptAt: new Date(),
        lastError: null,
        failureClass: null,
      },
    });
    return true;
  } catch (error) {
    logServerError("v1.message.publish_failed", error, {
      requestId: message.requestId,
      correlationId: message.correlationId,
      enqueueKey: message.idempotencyKey,
      jobId: message.id,
    });
    await prisma.message.updateMany({
      where: { id: message.id, status: { in: [Status.ENQUEUE_PENDING, Status.PENDING] } },
      data: {
        failureClass: "PUBLISH_CONFIRM_FAILED",
        lastError: error instanceof Error ? error.message : String(error),
      },
    });
    return false;
  }
}
