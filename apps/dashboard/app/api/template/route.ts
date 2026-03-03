import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { templateCreateSchema } from "@/lib/validators";
import * as fs from "fs";
import * as path from "path";

const TEMPLATES_DIR = path.join(process.cwd(), "../../templates");

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

  const body = await request.json();
  const parsed = templateCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, subject, content, storageType } = parsed.data;

  // Auto-generate filename from name: lowercase, spaces → hyphens, .mjml extension
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const filename = `${slug}.mjml`;

  if (storageType === "LOCAL") {
    try {
      fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
      const filePath = path.join(TEMPLATES_DIR, filename);
      if (fs.existsSync(filePath)) {
        return NextResponse.json(
          { success: false, message: `File ${filename} already exists` },
          { status: 409 }
        );
      }
      fs.writeFileSync(filePath, content, "utf8");
    } catch {
      return NextResponse.json(
        { success: false, message: "Failed to write template file" },
        { status: 500 }
      );
    }
  }

  try {
    const result = await prisma.template.create({
      data: { name, subject, filename, storageType },
    });
    return NextResponse.json({ success: true, message: result.id });
  } catch {
    // Roll back file write if DB fails
    if (storageType === "LOCAL") {
      try { fs.unlinkSync(path.join(TEMPLATES_DIR, filename)); } catch { /* ignore */ }
    }
    return NextResponse.json(
      { success: false, message: "Failed to create template" },
      { status: 500 }
    );
  }
}
