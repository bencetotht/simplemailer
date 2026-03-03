import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const [total, sent, failed, pending, retrying, queued, processing, dead] = await Promise.all([
    prisma.log.count(),
    prisma.log.count({ where: { status: "SENT" } }),
    prisma.log.count({ where: { status: "FAILED" } }),
    prisma.log.count({ where: { status: { in: ["ENQUEUE_PENDING", "PENDING"] } } }),
    prisma.log.count({ where: { status: "RETRYING" } }),
    prisma.log.count({ where: { status: "QUEUED" } }),
    prisma.log.count({ where: { status: "PROCESSING" } }),
    prisma.log.count({ where: { status: "DEAD" } }),
  ]);

  const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

  return NextResponse.json({
    total,
    sent,
    failed,
    pending,
    retrying,
    queued,
    processing,
    dead,
    successRate,
  });
}
