import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/auth";
import { getQueueMessages, redactQueueMessages } from "@/lib/queue";

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List queued mail jobs
 *     description: Returns up to 10 messages currently sitting in the RabbitMQ `mailer` queue (non-destructive peek via management API).
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Array of raw queue message objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 additionalProperties: true
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const jobs = await getQueueMessages("mailer");
  return NextResponse.json(redactQueueMessages(jobs));
}
