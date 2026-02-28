import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * @swagger
 * /api/template:
 *   get:
 *     summary: List email templates
 *     description: Returns all templates as lightweight summaries (id + name). Use `GET /api/template/{id}` to fetch the rendered content.
 *     tags: [Templates]
 *     responses:
 *       200:
 *         description: Array of template summaries
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/TemplateSummary'
 */
export async function GET() {
  const templates = await prisma.template.findMany({
    select: { id: true, name: true },
  });
  return NextResponse.json(templates);
}
