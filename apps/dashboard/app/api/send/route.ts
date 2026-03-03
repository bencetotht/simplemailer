import { randomUUID } from "crypto";
import { Prisma, Status } from "database";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { logServerError } from "@/lib/log";
import { consumeRateLimitToken } from "@/lib/rate-limit";
import { mailJobSchema } from "@/lib/validators";
import { publishToMailerQueue } from "@/lib/queue";

const NON_TERMINAL_STATUSES: Status[] = [
  Status.ENQUEUE_PENDING,
  Status.QUEUED,
  Status.PROCESSING,
  Status.RETRYING,
  Status.PENDING,
];

function idempotencyResponse(jobId: string, status: Status): NextResponse {
  return NextResponse.json(
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
    return NextResponse.json(
      { success: false, message: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const body = await request.json();
  const parsed = mailJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const enqueueKey = request.headers.get("idempotency-key")?.trim() || null;
  if (enqueueKey) {
    const existing = await prisma.log.findUnique({ where: { enqueueKey } });
    if (existing && NON_TERMINAL_STATUSES.includes(existing.status)) {
      return idempotencyResponse(existing.id, existing.status);
    }
  }

  const correlationId = randomUUID();
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
        correlationId,
      },
    });
  } catch (error) {
    if (isIdempotencyConflict(error) && enqueueKey) {
      const existing = await prisma.log.findUnique({ where: { enqueueKey } });
      if (existing && NON_TERMINAL_STATUSES.includes(existing.status)) {
        return idempotencyResponse(existing.id, existing.status);
      }
    }
    return NextResponse.json(
      { success: false, message: "Failed to create enqueue log" },
      { status: 500 },
    );
  }

  try {
    await publishToMailerQueue({
      jobId: log.id,
      attempt: 0,
      correlationId,
      data: parsed.data,
    });

    log = await prisma.log.update({
      where: { id: log.id },
      data: {
        status: Status.QUEUED,
        lastAttemptAt: new Date(),
        lastError: null,
        failureClass: null,
      },
    });

    return NextResponse.json(
      { success: true, jobId: log.id, status: log.status },
      { status: 202 },
    );
  } catch (error) {
    logServerError("api.send.publish_failed", error, { jobId: log.id });
    await prisma.log.update({
      where: { id: log.id },
      data: {
        lastError: error instanceof Error ? error.message : String(error),
        failureClass: "PUBLISH_CONFIRM_FAILED",
      },
    });
    return NextResponse.json(
      { success: false, message: "Failed to enqueue mail job" },
      { status: 503 },
    );
  }
}

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const enqueueKey = request.nextUrl.searchParams.get("enqueueKey");
  if (!enqueueKey) {
    return NextResponse.json(
      { success: false, message: "enqueueKey query parameter is required" },
      { status: 400 },
    );
  }

  const log = await prisma.log.findUnique({
    where: { enqueueKey },
    select: { id: true, status: true, retryCount: true, createdAt: true, updatedAt: true },
  });

  if (!log) {
    return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...log });
}

function isIdempotencyConflict(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
