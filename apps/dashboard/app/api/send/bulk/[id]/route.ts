import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { summarizeBulkItems } from "@/lib/bulk-send";

function parsePaging(searchParams: URLSearchParams): { skip: number; take: number; status?: string } {
  const skipRaw = Number(searchParams.get("skip") ?? 0);
  const takeRaw = Number(searchParams.get("take") ?? 50);
  const status = searchParams.get("status") ?? undefined;

  return {
    skip: Number.isFinite(skipRaw) && skipRaw > 0 ? Math.floor(skipRaw) : 0,
    take: Number.isFinite(takeRaw) && takeRaw > 0 ? Math.min(Math.floor(takeRaw), 100) : 50,
    status,
  };
}

/**
 * @swagger
 * /api/send/bulk/{id}:
 *   get:
 *     summary: Inspect a bulk send batch
 *     description: Returns bulk batch counts plus paginated per-recipient item statuses.
 *     tags: [Mail]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bulk batch details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BulkSendBatchResponse'
 *       404:
 *         description: Batch not found
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { id } = await context.params;
  const paging = parsePaging(request.nextUrl.searchParams);

  const batch = await prisma.bulkSendBatch.findUnique({
    where: { id },
    select: {
      id: true,
      accountId: true,
      templateId: true,
      requestedCount: true,
      acceptedCount: true,
      rejectedCount: true,
      requestedMinDelayMs: true,
      effectiveMinDelayMs: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: { sequence: "asc" },
        select: {
          id: true,
          sequence: true,
          recipient: true,
          values: true,
          validationError: true,
          logId: true,
          createdAt: true,
          updatedAt: true,
          log: {
            select: {
              id: true,
              status: true,
              scheduledFor: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (!batch) {
    return NextResponse.json(
      { success: false, message: "Bulk batch not found" },
      { status: 404 },
    );
  }

  const {
    countsByStatus,
    terminalAcceptedCount,
    items: normalizedItems,
  } = summarizeBulkItems(batch.items);

  if (!batch.completedAt && batch.acceptedCount > 0 && terminalAcceptedCount === batch.acceptedCount) {
    const completedBatch = await prisma.bulkSendBatch.update({
      where: { id: batch.id },
      data: { completedAt: new Date() },
      select: { completedAt: true },
    });
    batch.completedAt = completedBatch.completedAt;
  }

  const filteredItems = paging.status
    ? normalizedItems.filter((item) => item.status === paging.status)
    : normalizedItems;
  const paginatedItems = filteredItems.slice(paging.skip, paging.skip + paging.take);

  return NextResponse.json({
    success: true,
    batch: {
      id: batch.id,
      accountId: batch.accountId,
      templateId: batch.templateId,
      requestedCount: batch.requestedCount,
      acceptedCount: batch.acceptedCount,
      rejectedCount: batch.rejectedCount,
      requestedMinDelayMs: batch.requestedMinDelayMs,
      effectiveMinDelayMs: batch.effectiveMinDelayMs,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      countsByStatus,
    },
    items: paginatedItems,
    total: filteredItems.length,
    skip: paging.skip,
    take: paging.take,
  });
}
