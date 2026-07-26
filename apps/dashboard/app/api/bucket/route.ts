import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { encryptSecret } from "@/lib/secrets";
import { bucketSchema } from "@/lib/validators";
import { apiError, JSON_LIMITS, jsonResponse, readJsonBody } from "@/lib/http";

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

  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = bucketSchema.safeParse(body.value);

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
    return jsonResponse(request, { success: true, message: result.id });
  } catch {
    return apiError(
      request,
      500,
      "BUCKET_CREATE_FAILED",
      "Failed to create bucket",
    );
  }
}
