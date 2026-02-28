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
  prisma?: PrismaClient;
};

// Named export with global memoization
// Cast to PrismaClient to avoid union type issues from the conditional Accelerate extension
export const prisma: PrismaClient =
  (globalForPrisma.prisma ?? extendedPrisma) as PrismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
