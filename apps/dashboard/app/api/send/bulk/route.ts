import { randomUUID } from "crypto";
import { Prisma, Status } from "database";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { logServerError } from "@/lib/log";
import { consumeRateLimitToken } from "@/lib/rate-limit";
import {
  buildScheduledSendTimes,
  clampBulkMinDelayMs,
  computeInitialScheduleStart,
  validateBulkRecipients,
} from "@/lib/bulk-send";
import { bulkMailJobSchema } from "@/lib/validators";
import { apiError, getRequestMetadata, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { canonicalRequestDigest, isMateriallyDifferent } from "@/lib/idempotency";
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/legacy-contract";

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
  requestDigest: string | null;
  items: Array<{
    sequence: number;
    recipient: string;
    validationError: string | null;
  }>;
};

function acceptedResponse(request: NextRequest, batch: ExistingBatchResponse) {
  return jsonResponse(
    request,
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
      requestDigest: true,
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
 *       schedules accepted recipients with DB-backed pacing for workers to
 *       publish when each item becomes due.
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
    return apiError(
      request,
      429,
      "RATE_LIMITED",
      "Rate limit exceeded",
      { headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await readJsonBody(request, JSON_LIMITS.bulkSend);
  if (!body.ok) return body.response;
  const parsed = bulkMailJobSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "VALIDATION_FAILED",
      "Request validation failed",
      { details: parsed.error.flatten().fieldErrors },
    );
  }

  const requestDigest = canonicalRequestDigest(parsed.data);
  const enqueueKey = request.headers.get("idempotency-key")?.trim() || null;
  if (enqueueKey && enqueueKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return apiError(
      request,
      400,
      "INVALID_IDEMPOTENCY_KEY",
      `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
    );
  }
  if (enqueueKey) {
    const existingBatch = await findBatchForResponse(enqueueKey);
    if (existingBatch) {
      if (isMateriallyDifferent(existingBatch.requestDigest, requestDigest)) {
        return apiError(
          request,
          409,
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key was already used with a different request",
        );
      }
      return acceptedResponse(request, existingBatch);
    }
  }

  const sharedValues = parsed.data.sharedValues;
  const { accepted, rejected } = validateBulkRecipients(parsed.data.recipients, sharedValues);
  if (accepted.length === 0) {
    return apiError(
      request,
      400,
      "ALL_RECIPIENTS_REJECTED",
      "All recipients were rejected",
      {
        details: rejected.map((item) => ({
          index: item.index,
          recipient: item.recipient,
          error: item.error,
        })),
        compatibilityFields: {
          rejectedItems: rejected.map((item) => ({
            index: item.index,
            recipient: item.recipient,
            error: item.error,
          })),
        },
      },
    );
  }

  const requestedMinDelayMs = parsed.data.options?.minDelayMs;
  const effectiveMinDelayMs = clampBulkMinDelayMs(requestedMinDelayMs);
  const now = new Date();
  const { requestId, correlationId: batchCorrelationId } = getRequestMetadata(request);

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
          requestDigest,
          correlationId: batchCorrelationId,
          requestedMinDelayMs: requestedMinDelayMs === undefined ? null : Math.round(requestedMinDelayMs),
          effectiveMinDelayMs,
        },
      });

      const rejectedItems = rejected.map((item) => ({
        id: randomUUID(),
        batchId: batch.id,
        sequence: item.index,
        recipient: item.recipient ?? "",
        values: item.values as Prisma.InputJsonValue,
        validationError: item.error,
      }));

      const acceptedRows = accepted.map((item, acceptedIndex) => {
        const itemId = randomUUID();
        const logId = randomUUID();
        const correlationId = randomUUID();
        return {
          item: {
            id: itemId,
            batchId: batch.id,
            sequence: item.index,
            recipient: item.recipient,
            values: item.values as Prisma.InputJsonValue,
            validationError: null,
          },
          log: {
            id: logId,
            accountId: parsed.data.accountId,
            recipient: item.recipient,
            templateId: parsed.data.templateId,
            values: item.values as Prisma.InputJsonValue,
            status: Status.ENQUEUE_PENDING,
            correlationId,
            bulkBatchId: batch.id,
            bulkItemId: itemId,
            scheduledFor: scheduledTimes[acceptedIndex] ?? startAt,
          },
        };
      });

      await tx.bulkSendItem.createMany({
        data: [...rejectedItems, ...acceptedRows.map((row) => row.item)],
      });
      await tx.log.createMany({
        data: acceptedRows.map((row) => row.log),
      });

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
      };
    });

    return jsonResponse(
      request,
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
      const code = error.status === 404
        ? error.message === "Account not found"
          ? "ACCOUNT_NOT_FOUND"
          : "TEMPLATE_NOT_FOUND"
        : "BULK_REQUEST_FAILED";
      return apiError(request, error.status, code, error.message);
    }

    if (isIdempotencyConflict(error) && enqueueKey) {
      const existingBatch = await findBatchForResponse(enqueueKey);
      if (existingBatch) {
        if (isMateriallyDifferent(existingBatch.requestDigest, requestDigest)) {
          return apiError(
            request,
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency-Key was already used with a different request",
          );
        }
        return acceptedResponse(request, existingBatch);
      }
    }

    logServerError("api.send_bulk.create_failed", error, {
      accountId: parsed.data.accountId,
      recipientCount: parsed.data.recipients.length,
      requestId,
      correlationId: batchCorrelationId,
      enqueueKey,
    });

    return apiError(
      request,
      500,
      "PERSISTENCE_FAILED",
      "Failed to create bulk batch",
    );
  }
}
