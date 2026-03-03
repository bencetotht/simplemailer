import { NextRequest, NextResponse } from "next/server";
import { prisma } from "database";
import { requireApiKey } from "@/lib/auth";
import { logServerError } from "@/lib/log";

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
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  try {
    const thirtySecondsAgo = new Date(Date.now() - 30_000);
    const workers = await prisma.workerHeartbeat.findMany({
      where: {
        lastHeartbeat: { gte: thirtySecondsAgo },
      },
      orderBy: { lastHeartbeat: "desc" },
    });
    return NextResponse.json(workers);
  } catch (error) {
    logServerError("api.workers.query_failed", error);
    return NextResponse.json([], { status: 200 });
  }
}
