import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import * as fs from "fs";

/**
 * @swagger
 * /api/template/{id}:
 *   get:
 *     summary: Get template content
 *     description: >
 *       Returns the raw template file content as plain text.
 *       For `LOCAL` storage type, the file is read from the `../../templates/` directory.
 *       For `S3` storage type, an empty string is returned (S3 fetching not yet implemented).
 *     tags: [Templates]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Template ID
 *     responses:
 *       200:
 *         description: Template file contents
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Template not found in database or file not found on disk
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      `../../templates/${template.filename}`,
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
