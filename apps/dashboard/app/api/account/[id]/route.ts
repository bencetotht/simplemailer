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
    const existing = await prisma.account.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return apiError(_request, 404, "ACCOUNT_NOT_FOUND", "Account not found");
    }
    await prisma.account.delete({ where: { id } });
    return jsonResponse(_request, { success: true });
  } catch {
    return apiError(
      _request,
      500,
      "ACCOUNT_DELETE_FAILED",
      "Failed to delete account",
    );
  }
}
