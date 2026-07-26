import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey } from "@/lib/auth";
import { templateUpdateSchema } from "@/lib/validators";
import * as fs from "fs";
import * as path from "path";
import { deleteTemplate, getTemplate, putTemplate } from "@/lib/template-storage";
import {
  apiError,
  JSON_LIMITS,
  jsonResponse,
  readJsonBody,
  withTimeout,
} from "@/lib/http";

const TEMPLATES_DIR = path.join(process.cwd(), "../../templates");
const TEMPLATE_STORAGE_TIMEOUT_MS = 10_000;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = requireApiKey(_request);
  if (unauthorized) return unauthorized;

  const { id } = await params;

  try {
    const existing = await prisma.template.findUnique({ where: { id } });
    if (!existing) {
      return apiError(_request, 404, "TEMPLATE_NOT_FOUND", "Template not found");
    }
    const template = await prisma.template.delete({ where: { id } });
    if (template.storageType === "S3") {
      try {
        await withTimeout(
          deleteTemplate(template.filename),
          TEMPLATE_STORAGE_TIMEOUT_MS,
          "template delete",
        );
      } catch { /* orphan cleanup can be retried */ }
    } else {
      try { fs.unlinkSync(path.join(TEMPLATES_DIR, template.filename)); } catch { /* already absent */ }
    }
    return jsonResponse(_request, { success: true });
  } catch {
    return apiError(
      _request,
      500,
      "TEMPLATE_DELETE_FAILED",
      "Failed to delete template",
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
    return apiError(_request, 404, "TEMPLATE_NOT_FOUND", "Template not found");
  }

  if (template.storageType === "S3") {
    try {
      return new NextResponse(await withTimeout(
        getTemplate(template.filename),
        TEMPLATE_STORAGE_TIMEOUT_MS,
        "template read",
      ), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch {
      return apiError(_request, 404, "TEMPLATE_CONTENT_NOT_FOUND", "Template object not found");
    }
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
    return apiError(_request, 404, "TEMPLATE_CONTENT_NOT_FOUND", "Template file not found");
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

  const body = await readJsonBody(request, JSON_LIMITS.controlPlane);
  if (!body.ok) return body.response;
  const parsed = templateUpdateSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError(
      request,
      400,
      "VALIDATION_FAILED",
      "Request validation failed",
      { details: parsed.error.flatten().fieldErrors },
    );
  }

  const template = await prisma.template.findUnique({ where: { id } });
  if (!template) {
    return apiError(request, 404, "TEMPLATE_NOT_FOUND", "Template not found");
  }

  const { name, subject, content } = parsed.data;

  // Update file content for LOCAL templates
  if (content !== undefined && template.storageType === "LOCAL") {
    try {
      fs.writeFileSync(path.join(TEMPLATES_DIR, template.filename), content, "utf8");
    } catch {
      return apiError(
        request,
        500,
        "TEMPLATE_STORAGE_FAILED",
        "Failed to write template file",
      );
    }
  }
  if (content !== undefined && template.storageType === "S3") {
    try {
      await withTimeout(
        putTemplate(template.filename, content),
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
    await prisma.template.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(subject !== undefined ? { subject } : {}),
      },
    });
    return jsonResponse(request, { success: true });
  } catch {
    return apiError(
      request,
      500,
      "TEMPLATE_UPDATE_FAILED",
      "Failed to update template",
    );
  }
}
