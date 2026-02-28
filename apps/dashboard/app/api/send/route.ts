import { NextRequest, NextResponse } from "next/server";
import { mailJobSchema } from "@/lib/validators";
import { publishToMailerQueue } from "@/lib/queue";

/**
 * @swagger
 * /api/send:
 *   post:
 *     summary: Queue a mail job
 *     description: Validates the payload and publishes a `mail.send` message to the durable RabbitMQ `mailer` queue.
 *     tags: [Mail]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MailJobRequest'
 *     responses:
 *       200:
 *         description: Message successfully queued
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Failed to publish to queue
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = mailJobSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await publishToMailerQueue(parsed.data);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
