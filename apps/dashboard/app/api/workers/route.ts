import { NextResponse } from "next/server";
import { prisma } from "database";

/**
 * @swagger
 * /api/workers:
 *   get:
 *     summary: List active workers
 *     description: Returns workers that sent a heartbeat within the last 30 seconds.
 *     tags: [Workers]
 *     responses:
 *       200:
 *         description: Array of active worker heartbeat records
 */
export async function GET() {
  const thirtySecondsAgo = new Date(Date.now() - 30_000);
  const workers = await prisma.workerHeartbeat.findMany({
    where: {
      lastHeartbeat: { gte: thirtySecondsAgo },
    },
    orderBy: { lastHeartbeat: "desc" },
  });
  return NextResponse.json(workers);
}
