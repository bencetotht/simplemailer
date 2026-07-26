import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import { accountSchema } from "@/lib/validators";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";

/**
 * @swagger
 * /api/account:
 *   get:
 *     summary: List SMTP accounts
 *     description: >
 *       Returns all accounts. When an `id` query parameter is provided, returns
 *       the full detail (including `emailHost` and `createdAt`) for that single
 *       account. Without `id`, returns a lighter summary list.
 *     tags: [Accounts]
 *     parameters:
 *       - in: query
 *         name: id
 *         schema:
 *           type: string
 *         description: Filter by account ID — returns full detail for that account
 *     responses:
 *       200:
 *         description: Array of accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/AccountSummary'
 *                   - $ref: '#/components/schemas/AccountDetail'
 *   post:
 *     summary: Create an SMTP account
 *     description: Creates a new SMTP account. Passwords are stored as-is (app passwords).
 *     tags: [Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AccountRequest'
 *     responses:
 *       200:
 *         description: Account created — `message` contains the new account ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 *       500:
 *         description: Database error (e.g. duplicate username)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? undefined;

  const accounts = id
    ? await prisma.account.findMany({
        where: { id },
        select: {
          id: true,
          name: true,
          username: true,
          emailHost: true,
          createdAt: true,
        },
      })
    : await prisma.account.findMany({
        select: { id: true, name: true, username: true, emailHost: true, emailPort: true, createdAt: true },
      });

  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = accountSchema.safeParse(body.value);

  if (!parsed.success) {
    return apiError(
      request,
      400,
      "VALIDATION_FAILED",
      "Request validation failed",
      { details: parsed.error.flatten().fieldErrors },
    );
  }

  try {
    const encryptedPassword = encryptSecret(parsed.data.password);
    const result = await prisma.account.create({
      data: {
        name: parsed.data.name,
        username: parsed.data.username,
        emailHost: parsed.data.emailHost,
        emailPort: parsed.data.emailPort,
        passwordEnc: encryptedPassword,
        password: null,
      },
    });
    return jsonResponse(request, { success: true, message: result.id });
  } catch {
    return apiError(
      request,
      500,
      "ACCOUNT_CREATE_FAILED",
      "Failed to create account",
    );
  }
}
