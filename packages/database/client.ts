import fs from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";
import { withAccelerate } from "@prisma/extension-accelerate";

function parseEnvValue(contents: string, key: string): string | null {
  const line = contents
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return null;
  const [, ...rest] = line.split("=");
  if (rest.length === 0) return null;
  return rest.join("=").trim().replace(/^['"]|['"]$/g, "");
}

function tryReadFromFile(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const contents = fs.readFileSync(filePath, "utf8");
  return parseEnvValue(contents, key);
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "../.env"),
    path.resolve(cwd, "../../.env"),
    path.resolve(cwd, "../../../.env"),
    path.resolve(cwd, ".env.local"),
    path.resolve(cwd, "../.env.local"),
    path.resolve(cwd, "../../.env.local"),
  ];

  for (const candidate of candidates) {
    const value = tryReadFromFile(candidate, "DATABASE_URL");
    if (value) return value;
  }

  throw new Error("DATABASE_URL is not set");
}

const datasourceUrl = resolveDatabaseUrl();
const hasAccelerateUrl =
  datasourceUrl.startsWith("prisma://") ||
  datasourceUrl.startsWith("prisma+postgres://");

const basePrisma = hasAccelerateUrl
  ? new PrismaClient({ accelerateUrl: datasourceUrl })
  : new PrismaClient({
      adapter: new PrismaPg({ connectionString: datasourceUrl }),
    });
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
