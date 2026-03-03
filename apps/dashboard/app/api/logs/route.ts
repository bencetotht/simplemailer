import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: List delivery logs
 *     description: Returns paginated mail delivery log records with optional filters.
 *     tags: [Logs]
 *     parameters:
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip (pagination offset)
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records to return
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, SENT, FAILED, RETRYING]
 *         description: Filter by status
 *       - in: query
 *         name: recipient
 *         schema:
 *           type: string
 *         description: Filter by recipient (partial match)
 *     responses:
 *       200:
 *         description: Paginated log entries
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10);
  const take = parseInt(searchParams.get("take") ?? "20", 10);
  const status = searchParams.get("status") ?? undefined;
  const recipient = searchParams.get("recipient") ?? undefined;

  const where = {
    ...(status ? { status: status as "PENDING" | "SENT" | "FAILED" | "RETRYING" } : {}),
    ...(recipient ? { recipient: { contains: recipient, mode: "insensitive" as const } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.log.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        recipient: true,
        status: true,
        retryCount: true,
        completedAt: true,
        createdAt: true,
        account: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    }),
    prisma.log.count({ where }),
  ]);

  return NextResponse.json({ data, total });
}
