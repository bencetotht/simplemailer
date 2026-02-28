import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: List delivery logs
 *     description: Returns the most recent mail delivery log records ordered by creation date descending, with nested account and template info.
 *     tags: [Logs]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Maximum number of log entries to return
 *     responses:
 *       200:
 *         description: Array of log entries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LogEntry'
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "10", 10);

  const logs = await prisma.log.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      recipient: true,
      status: true,
      createdAt: true,
      account: {
        select: { id: true, name: true },
      },
      template: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(logs);
}
