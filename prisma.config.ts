import { defineConfig } from "prisma/config";

// Prisma 7 configuration file — replaces url/directUrl in schema.prisma
// Connection URLs are now defined here for migration commands.
//
// Dual connection string pattern for Supabase + PgBouncer:
// - datasource.url: Direct connection (port 5432) — used by Prisma migrate (DIRECT_URL)
// - Runtime: PrismaClient uses @prisma/adapter-pg with pooled URL (DATABASE_URL, port 6543)
//   See src/lib/db/prisma.ts for the runtime PrismaClient configuration.

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Direct connection for migrations — bypasses PgBouncer (port 5432)
    // Falls back to DATABASE_URL if DIRECT_URL is not set (e.g., during pnpm db:generate)
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
