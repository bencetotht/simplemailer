import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { accountSchema } from "@/lib/validators";

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
        select: { id: true, name: true, username: true },
      });

  return NextResponse.json(accounts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = accountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.account.create({ data: parsed.data });
    return NextResponse.json({ success: true, message: result.id });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: (error as Error).message },
      { status: 500 }
    );
  }
}
