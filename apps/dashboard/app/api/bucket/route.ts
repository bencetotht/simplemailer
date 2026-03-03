import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import { bucketSchema } from "@/lib/validators";

/**
 * @swagger
 * /api/bucket:
 *   get:
 *     summary: List S3 buckets
 *     description: Returns all configured S3 buckets (id, name, path, region). Credentials are never returned.
 *     tags: [Buckets]
 *     responses:
 *       200:
 *         description: Array of bucket summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BucketSummary'
 *   post:
 *     summary: Create an S3 bucket configuration
 *     description: Stores a new S3 bucket configuration including credentials.
 *     tags: [Buckets]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BucketRequest'
 *     responses:
 *       200:
 *         description: Bucket created — `message` contains the new bucket ID
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
 *         description: Database error (e.g. duplicate name)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const buckets = await prisma.bucket.findMany({
    select: { id: true, name: true, path: true, region: true },
  });
  return NextResponse.json(buckets);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const body = await request.json();
  const parsed = bucketSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.bucket.create({
      data: {
        name: parsed.data.name,
        path: parsed.data.path,
        region: parsed.data.region,
        accessKeyIdEnc: encryptSecret(parsed.data.accessKeyId),
        secretAccessKeyEnc: encryptSecret(parsed.data.secretAccessKey),
        accessKeyId: null,
        secretAccessKey: null,
      },
    });
    return NextResponse.json({ success: true, message: result.id });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to create bucket" },
      { status: 500 }
    );
  }
}
