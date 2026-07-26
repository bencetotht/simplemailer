import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { templateCreateSchema } from "@/lib/validators";
import * as fs from "fs";
import * as path from "path";
import { deleteTemplate, putTemplate } from "@/lib/template-storage";
import {
  apiError,
  JSON_LIMITS,
  jsonResponse,
  readJsonBody,
  withTimeout,
} from "@/lib/http";

const TEMPLATES_DIR = path.join(process.cwd(), "../../templates");
const TEMPLATE_STORAGE_TIMEOUT_MS = 10_000;

/**
 * @swagger
 * /api/template:
 *   get:
 *     summary: List email templates
 *     description: Returns all templates as summaries.
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Array of template summaries
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const templates = await prisma.template.findMany({
    select: { id: true, name: true, subject: true, storageType: true, createdAt: true },
  });
  return NextResponse.json(templates);
}

/**
 * @swagger
 * /api/template:
 *   post:
 *     summary: Create an email template
 *     description: Creates a new template record and writes content to the templates directory (LOCAL) or S3.
 *     tags: [Templates]
 */
export async function POST(request: NextRequest) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = templateCreateSchema.safeParse(body.value);

  if (!parsed.success) {
    return apiError(
      request,
      400,
      "VALIDATION_FAILED",
      "Request validation failed",
      { details: parsed.error.flatten().fieldErrors },
    );
  }

  const { name, subject, content, storageType } = parsed.data;

  // Auto-generate filename from name: lowercase, spaces → hyphens, .mjml extension
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}.mjml`;

  if (storageType === "LOCAL" && process.env.NODE_ENV === "production") {
    return apiError(
      request,
      400,
      "LOCAL_STORAGE_DISABLED",
      "LOCAL templates are development-only; use S3 storage",
    );
  }

  if (storageType === "LOCAL") {
    try {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
      const filePath = path.join(TEMPLATES_DIR, filename);
      if (fs.existsSync(filePath)) {
        return apiError(
          request,
          409,
          "TEMPLATE_ALREADY_EXISTS",
          `File ${filename} already exists`,
        );
      }
      fs.writeFileSync(filePath, content, "utf8");
    } catch {
      return apiError(
        request,
        500,
        "TEMPLATE_STORAGE_FAILED",
        "Failed to write template file",
      );
    }
  }
  if (storageType === "S3") {
    try {
      await withTimeout(
        putTemplate(filename, content),
        TEMPLATE_STORAGE_TIMEOUT_MS,
        "template upload",
      );
    } catch {
      return apiError(
        request,
        503,
        "TEMPLATE_STORAGE_UNAVAILABLE",
        "Failed to upload template",
      );
    }
  }

  try {
    const result = await prisma.template.create({
      data: { name, subject, filename, storageType },
    });
    return jsonResponse(request, { success: true, message: result.id });
  } catch {
    // Roll back file write if DB fails
    if (storageType === "LOCAL") {
      try { fs.unlinkSync(path.join(TEMPLATES_DIR, filename)); } catch { /* ignore */ }
    }
    if (storageType === "S3") {
      try {
        await withTimeout(
          deleteTemplate(filename),
          TEMPLATE_STORAGE_TIMEOUT_MS,
          "template cleanup",
        );
      } catch { /* ignore orphan cleanup failure */ }
    }
    return apiError(
      request,
      500,
      "TEMPLATE_CREATE_FAILED",
      "Failed to create template",
    );
  }
}
