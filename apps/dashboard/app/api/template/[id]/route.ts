import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { templateUpdateSchema } from "@/lib/validators";
import * as fs from "fs";
import * as path from "path";

const TEMPLATES_DIR = path.join(process.cwd(), "../../templates");

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKey(_request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to delete template" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/template/{id}:
 *   get:
 *     summary: Get template content
 *     description: Returns the raw template file content as plain text.
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKey(_request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  if (template.storageType === "S3") {
    return new NextResponse("", { status: 200 });
  }

  try {
    const content = fs.readFileSync(
      path.join(TEMPLATES_DIR, template.filename),
      "utf8"
    );
    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }
}

/**
 * @swagger
 * /api/template/{id}:
 *   patch:
 *     summary: Update a template
 *     description: Updates name, subject, and/or content. For LOCAL templates, the file is updated on disk.
 *     tags: [Templates]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKey(request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = templateUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, subject, content } = parsed.data;

  // Update file content for LOCAL templates
  if (content !== undefined && template.storageType === "LOCAL") {
    try {
      fs.writeFileSync(path.join(TEMPLATES_DIR, template.filename), content, "utf8");
    } catch {
      return NextResponse.json(
        { success: false, message: "Failed to write template file" },
        { status: 500 }
      );
    }
  }

  try {
    await prisma.template.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(subject !== undefined ? { subject } : {}),
      },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Failed to update template" },
      { status: 500 }
    );
  }
}
