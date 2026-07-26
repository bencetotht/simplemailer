import { Prisma, Status } from "database";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { logServerError } from "@/lib/log";
import { consumeRateLimitToken } from "@/lib/rate-limit";
import { mailJobSchema } from "@/lib/validators";
import { publishLogRecords } from "@/lib/send-jobs";
import { apiError, getRequestMetadata, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";
import { canonicalRequestDigest, isMateriallyDifferent } from "@/lib/idempotency";
import { MAX_IDEMPOTENCY_KEY_LENGTH } from "@/lib/legacy-contract";

function idempotencyResponse(request: NextRequest, jobId: string, status: Status): NextResponse {
  return jsonResponse(
    request,
    { success: true, jobId, status },
    { status: 202 },
  );
}

/**
 * @swagger
 * /api/send:
 *   post:
 *     summary: Queue a mail job
 *     description: Validates the payload and publishes a durable message to RabbitMQ using publisher confirms.
 *     tags: [Mail]
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const rateLimit = consumeRateLimitToken(request, "send-mail", {
    capacity: 60,
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

  const body = await readJsonBody(request, JSON_LIMITS.send);
  if (!body.ok) return body.response;
  const parsed = mailJobSchema.safeParse(body.value);
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
    const existing = await prisma.log.findUnique({ where: { enqueueKey } });
    if (existing) {
      if (isMateriallyDifferent(existing.requestDigest, requestDigest)) {
        return apiError(
          request,
          409,
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key was already used with a different request",
        );
      }
      return idempotencyResponse(request, existing.id, existing.status);
    }
  }

  const [account, template] = await Promise.all([
    prisma.account.findUnique({ where: { id: parsed.data.accountId }, select: { id: true } }),
    prisma.template.findUnique({ where: { id: parsed.data.templateId }, select: { id: true } }),
  ]);
  if (!account) {
    return apiError(request, 404, "ACCOUNT_NOT_FOUND", "Account not found");
  }
  if (!template) {
    return apiError(request, 404, "TEMPLATE_NOT_FOUND", "Template not found");
  }

  const { requestId, correlationId } = getRequestMetadata(request);
  let log;
  try {
    log = await prisma.log.create({
      data: {
        accountId: parsed.data.accountId,
        templateId: parsed.data.templateId,
        recipient: parsed.data.recipient,
        values: parsed.data.values as Prisma.InputJsonValue,
        status: Status.ENQUEUE_PENDING,
        enqueueKey,
        requestDigest,
        correlationId,
      },
    });
  } catch (error) {
    if (isIdempotencyConflict(error) && enqueueKey) {
      const existing = await prisma.log.findUnique({ where: { enqueueKey } });
      if (existing) {
        if (isMateriallyDifferent(existing.requestDigest, requestDigest)) {
          return apiError(
            request,
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency-Key was already used with a different request",
          );
        }
        return idempotencyResponse(request, existing.id, existing.status);
      }
    }
    logServerError("api.send.persist_failed", error, {
      requestId,
      correlationId,
      enqueueKey,
    });
    return apiError(
      request,
      500,
      "PERSISTENCE_FAILED",
      "Failed to create enqueue log",
    );
  }

  try {
    const publishResult = await publishLogRecords([{
      id: log.id,
      accountId: parsed.data.accountId,
      templateId: parsed.data.templateId,
      recipient: parsed.data.recipient,
      values: parsed.data.values as Prisma.JsonValue,
      correlationId,
      requestId,
      enqueueKey,
    }]);

    if (publishResult.failedIds.length > 0) {
      return apiError(
        request,
        503,
        "ENQUEUE_FAILED",
        "Failed to enqueue mail job",
      );
    }

    log = await prisma.log.findUniqueOrThrow({ where: { id: log.id } });

    return jsonResponse(
      request,
      { success: true, jobId: log.id, status: log.status },
      { status: 202 },
    );
  } catch (error) {
    logServerError("api.send.publish_failed", error, {
      requestId,
      correlationId,
      enqueueKey,
      jobId: log.id,
    });
    return apiError(
      request,
      503,
      "ENQUEUE_FAILED",
      "Failed to enqueue mail job",
    );
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const enqueueKey = request.nextUrl.searchParams.get("enqueueKey");
  if (!enqueueKey) {
    return apiError(
      request,
      400,
      "MISSING_ENQUEUE_KEY",
      "enqueueKey query parameter is required",
    );
  }

  const log = await prisma.log.findUnique({
    where: { enqueueKey },
    select: { id: true, status: true, retryCount: true, createdAt: true, updatedAt: true },
  });

  if (!log) {
    return apiError(request, 404, "JOB_NOT_FOUND", "Job not found");
  }

  return jsonResponse(request, { success: true, ...log });
}

function isIdempotencyConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
