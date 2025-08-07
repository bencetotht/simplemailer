import { PrismaClient } from "./generated/client";
import { withAccelerate } from "@prisma/extension-accelerate";

// Instantiate the extended Prisma client to infer its type
const extendedPrisma = new PrismaClient().$extends(withAccelerate());
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