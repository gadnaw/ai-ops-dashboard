// Prisma 7 singleton with @prisma/adapter-pg for Supabase + PgBouncer runtime.
//
// Dual connection string pattern:
//   DATABASE_URL — pooled connection (PgBouncer, port 6543) for runtime queries
//   DIRECT_URL   — direct connection (port 5432) for migrations (prisma.config.ts)
//
// The pg.Pool is used at runtime. Prisma migrate uses DIRECT_URL from prisma.config.ts.
// CANONICAL IMPORT: import { prisma } from '@/lib/db/prisma'
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Build the pool lazily so module import doesn't crash in environments
// where DATABASE_URL is not yet set (e.g., during type-check in CI).
function createPrismaClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
