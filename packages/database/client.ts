import { PrismaClient } from "./generated/client";
import { withAccelerate } from "@prisma/extension-accelerate";

const hasAccelerateUrl =
  process.env.DATABASE_URL?.startsWith("prisma://") ||
  process.env.DATABASE_URL?.startsWith("prisma+postgres://");

const basePrisma = new PrismaClient();
const extendedPrisma = hasAccelerateUrl
  ? basePrisma.$extends(withAccelerate())
  : basePrisma;
type ExtendedPrismaClient = typeof extendedPrisma;

// Use globalThis for broader environment compatibility
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: ExtendedPrismaClient;
};

// Named export with global memoization
export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma ?? extendedPrisma;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
