import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [total, sent, failed, pending, retrying] = await Promise.all([
    prisma.log.count(),
    prisma.log.count({ where: { status: "SENT" } }),
    prisma.log.count({ where: { status: "FAILED" } }),
    prisma.log.count({ where: { status: "PENDING" } }),
    prisma.log.count({ where: { status: "RETRYING" } }),
  ]);

  const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

  return NextResponse.json({ total, sent, failed, pending, retrying, successRate });
}
