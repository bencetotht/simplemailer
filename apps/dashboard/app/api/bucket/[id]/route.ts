import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { apiError, jsonResponse } from "@/lib/http";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKey(_request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const existing = await prisma.bucket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return apiError(_request, 404, "BUCKET_NOT_FOUND", "Bucket not found");
    }
    await prisma.bucket.delete({ where: { id } });
    return jsonResponse(_request, { success: true });
  } catch {
    return apiError(
      _request,
      500,
      "BUCKET_DELETE_FAILED",
      "Failed to delete bucket",
    );
  }
}
