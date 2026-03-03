import { NextResponse } from "next/server";

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check
 *     description: Returns the current status, a human-readable message, and the API version.
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    message: "SimpleMailer dashboard API is running",
    version: "2.0.0",
  });
}
