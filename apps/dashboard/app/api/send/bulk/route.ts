import { randomUUID } from "crypto";
import { Prisma, Status } from "database";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { consumeRateLimitToken } from "@/lib/rate-limit";
import {
  buildScheduledSendTimes,
  clampBulkMinDelayMs,
  computeInitialScheduleStart,
  validateBulkRecipients,
} from "@/lib/bulk-send";
import { bulkMailJobSchema } from "@/lib/validators";
import { publishLogRecords } from "@/lib/send-jobs";

class RouteError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

type ExistingBatchResponse = {
  id: string;
  requestedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  effectiveMinDelayMs: number;
  items: Array<{
    sequence: number;
    recipient: string;
    validationError: string | null;
  }>;
};

function acceptedResponse(batch: ExistingBatchResponse) {
  return NextResponse.json(
    {
      success: true,
      batchId: batch.id,
      requestedCount: batch.requestedCount,
      acceptedCount: batch.acceptedCount,
      rejectedCount: batch.rejectedCount,
      effectiveMinDelayMs: batch.effectiveMinDelayMs,
      rejectedItems: batch.items
        .filter((item) => item.validationError)
        .map((item) => ({
          index: item.sequence,
          recipient: item.recipient,
          error: item.validationError,
        })),
    },
    { status: 202 },
  );
}

async function findBatchForResponse(enqueueKey: string): Promise<ExistingBatchResponse | null> {
  return prisma.bulkSendBatch.findUnique({
    where: { enqueueKey },
    select: {
      id: true,
      requestedCount: true,
      acceptedCount: true,
      rejectedCount: true,
      effectiveMinDelayMs: true,
      items: {
        where: { validationError: { not: null } },
        orderBy: { sequence: "asc" },
        select: {
          sequence: true,
          recipient: true,
          validationError: true,
        },
      },
    },
  });
}

function isIdempotencyConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * @swagger
 * /api/send/bulk:
 *   post:
 *     summary: Queue a paced bulk mail batch
 *     description: >
 *       Validates the payload, stores a bulk batch with per-recipient items,
 *       schedules accepted recipients with DB-backed pacing, and immediately
 *       publishes any items already due for delivery.
 *     tags: [Mail]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkSendRequest'
 *     responses:
 *       202:
 *         description: Bulk batch accepted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkSendAcceptedResponse'
 *       400:
 *         description: Validation failed or all recipients were rejected
 *       404:
 *         description: Account or template was not found
 *       429:
 *         description: Rate limit exceeded
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const rateLimit = consumeRateLimitToken(request, "send-bulk-mail", {
    capacity: 5,
    refillWindowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, message: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json();
  const parsed = bulkMailJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const enqueueKey = request.headers.get("idempotency-key")?.trim() || null;
  if (enqueueKey) {
    const existingBatch = await findBatchForResponse(enqueueKey);
    if (existingBatch) {
      return acceptedResponse(existingBatch);
    }
  }

  const sharedValues = parsed.data.sharedValues;
  const { accepted, rejected } = validateBulkRecipients(parsed.data.recipients, sharedValues);
  if (accepted.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: "All recipients were rejected",
        rejectedItems: rejected.map((item) => ({
          index: item.index,
          recipient: item.recipient,
          error: item.error,
        })),
      },
      { status: 400 },
    );
  }

  const requestedMinDelayMs = parsed.data.options?.minDelayMs;
  const effectiveMinDelayMs = clampBulkMinDelayMs(requestedMinDelayMs);
  const now = new Date();
  const batchCorrelationId = randomUUID();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const accountRows = await tx.$queryRaw<Array<{ id: string; bulkNextAvailableAt: Date | null }>>(
        Prisma.sql`
          SELECT "id", "bulkNextAvailableAt"
          FROM "public"."Account"
          WHERE "id" = ${parsed.data.accountId}
          FOR UPDATE
        `,
      );

      if (accountRows.length === 0) {
        throw new RouteError("Account not found", 404, {
          success: false,
          message: "Account not found",
        });
      }

      const template = await tx.template.findUnique({
        where: { id: parsed.data.templateId },
        select: { id: true },
      });
      if (!template) {
        throw new RouteError("Template not found", 404, {
          success: false,
          message: "Template not found",
        });
      }

      const startAt = computeInitialScheduleStart(now, accountRows[0]?.bulkNextAvailableAt);
      const scheduledTimes = buildScheduledSendTimes(startAt, accepted.length, effectiveMinDelayMs);
      const nextAvailableAt = new Date(
        scheduledTimes[scheduledTimes.length - 1]!.getTime() + effectiveMinDelayMs,
      );

      const batch = await tx.bulkSendBatch.create({
        data: {
          accountId: parsed.data.accountId,
          templateId: parsed.data.templateId,
          sharedValues: sharedValues as Prisma.InputJsonValue,
          requestedCount: parsed.data.recipients.length,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          enqueueKey,
          correlationId: batchCorrelationId,
          requestedMinDelayMs: requestedMinDelayMs === undefined ? null : Math.round(requestedMinDelayMs),
          effectiveMinDelayMs,
        },
      });

      const dueLogs: Array<{
        id: string;
        accountId: string;
        templateId: string;
        recipient: string;
        values: Prisma.JsonValue;
        correlationId: string;
      }> = [];

      for (const item of rejected) {
        await tx.bulkSendItem.create({
          data: {
            batchId: batch.id,
            sequence: item.index,
            recipient: item.recipient ?? "",
            values: item.values as Prisma.InputJsonValue,
            validationError: item.error,
          },
        });
      }

      for (const [acceptedIndex, item] of accepted.entries()) {
        const bulkItem = await tx.bulkSendItem.create({
          data: {
            batchId: batch.id,
            sequence: item.index,
            recipient: item.recipient,
            values: item.values as Prisma.InputJsonValue,
          },
        });

        const correlationId = randomUUID();
        const scheduledFor = scheduledTimes[acceptedIndex] ?? startAt;
        const log = await tx.log.create({
          data: {
            accountId: parsed.data.accountId,
            recipient: item.recipient,
            templateId: parsed.data.templateId,
            values: item.values as Prisma.InputJsonValue,
            status: Status.ENQUEUE_PENDING,
            correlationId,
            bulkBatchId: batch.id,
            bulkItemId: bulkItem.id,
            scheduledFor,
          },
          select: {
            id: true,
            accountId: true,
            templateId: true,
            recipient: true,
            values: true,
            correlationId: true,
            scheduledFor: true,
          },
        });

        await tx.bulkSendItem.update({
          where: { id: bulkItem.id },
          data: { logId: log.id },
        });

        if ((log.scheduledFor ?? now).getTime() <= now.getTime()) {
          dueLogs.push({
            id: log.id,
            accountId: log.accountId,
            templateId: log.templateId,
            recipient: log.recipient,
            values: log.values,
            correlationId: log.correlationId ?? correlationId,
          });
        }
      }

      await tx.account.update({
        where: { id: parsed.data.accountId },
        data: { bulkNextAvailableAt: nextAvailableAt },
      });

      return {
        batchId: batch.id,
        requestedCount: batch.requestedCount,
        acceptedCount: batch.acceptedCount,
        rejectedCount: batch.rejectedCount,
        effectiveMinDelayMs: batch.effectiveMinDelayMs,
        rejectedItems: rejected.map((item) => ({
          index: item.index,
          recipient: item.recipient,
          error: item.error,
        })),
        dueLogs,
      };
    });

    if (created.dueLogs.length > 0) {
      await publishLogRecords(created.dueLogs);
    }

    return NextResponse.json(
      {
        success: true,
        batchId: created.batchId,
        requestedCount: created.requestedCount,
        acceptedCount: created.acceptedCount,
        rejectedCount: created.rejectedCount,
        effectiveMinDelayMs: created.effectiveMinDelayMs,
        rejectedItems: created.rejectedItems,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json(error.body, { status: error.status });
    }

    if (isIdempotencyConflict(error) && enqueueKey) {
      const existingBatch = await findBatchForResponse(enqueueKey);
      if (existingBatch) {
        return acceptedResponse(existingBatch);
      }
    }

    return NextResponse.json(
      { success: false, message: "Failed to create bulk batch" },
      { status: 500 },
    );
  }
}
