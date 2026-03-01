---
phase: 1
plan: "01-01"
title: "Scaffold — Next.js 15 + Prisma + Supabase + Folder Structure"
subsystem: "infrastructure"
tags: ["nextjs", "prisma", "supabase", "tailwind", "typescript", "vitest", "playwright"]

dependency-graph:
  requires: []
  provides:
    - PrismaClient singleton at @/lib/db/prisma (adapter-pg, pooled runtime)
    - DatabaseSchema with profiles and api_keys tables
    - FolderConventions documented in ADR-001
    - EnvironmentConfig via @t3-oss/env-nextjs + Zod 4
    - PackageScripts (db:generate, db:migrate, db:migrate:dev, db:studio, test, test:run, test:e2e)
  affects:
    - "01-02 Auth+RBAC — uses PrismaClient singleton, extends schema"
    - "01-03 DevOps — uses pnpm scripts in CI"
    - "02-01+ all phases — import from @/lib/db/prisma"

tech-stack:
  added:
    - "next@16.1.6 (Next.js App Router, Turbopack)"
    - "react@19.2.3 + react-dom@19.2.3"
    - "prisma@7.4.2 + @prisma/client@7.4.2"
    - "@prisma/adapter-pg@7.4.2 + pg@8.19.0 (runtime PgBouncer adapter)"
    - "tailwindcss@4.2.1 + @tailwindcss/postcss@4.2.1"
    - "typescript@5.9.3 (strict mode)"
    - "@t3-oss/env-nextjs@0.13.10 + zod@4.3.6"
    - "vitest@4.0.18 + @vitejs/plugin-react + jsdom"
    - "@testing-library/react@16.3.2 + @testing-library/jest-dom@6.9.1"
    - "@playwright/test@1.58.2"
    - "msw@2.12.10"
  patterns:
    - "Prisma 7 adapter pattern — prisma.config.ts for migration URL, @prisma/adapter-pg for runtime"
    - "Singleton PrismaClient with globalThis persistence across hot reloads"
    - "Next.js App Router route groups — (auth) and (dashboard)"
    - "Type-safe env validation with @t3-oss/env-nextjs"

key-files:
  created:
    - "package.json — scripts, dependencies"
    - "tsconfig.json — strict mode with noUncheckedIndexedAccess, exactOptionalPropertyTypes"
    - "next.config.ts — experimental.after, serverExternalPackages, fetch logging"
    - "prisma/schema.prisma — profiles, api_keys models, Role enum"
    - "prisma.config.ts — Prisma 7 datasource URL config (DIRECT_URL for migrations)"
    - "prisma/migrations/20260301000000_init_profiles_and_api_keys/migration.sql"
    - "prisma/migrations/migration_lock.toml"
    - "src/lib/db/prisma.ts — singleton with @prisma/adapter-pg"
    - "src/lib/env.ts — @t3-oss/env-nextjs env validation"
    - "src/app/layout.tsx — Inter font, AI Ops Dashboard metadata"
    - "src/app/page.tsx — root redirect to /dashboard"
    - "src/app/(auth)/layout.tsx + login/page.tsx — auth group"
    - "src/app/(dashboard)/layout.tsx — dashboard group"
    - "src/app/globals.css — Tailwind 4 @import with --font-inter theme"
    - "docs/ADR-001-architecture-decisions.md — canonical folder/naming conventions"
    - ".env.example — full variable reference with Supabase connection string instructions"
    - "supabase/setup.sql — auth trigger and RLS policies for Supabase SQL Editor"
    - "vitest.config.ts — Vitest 4, jsdom environment, @/* alias"
    - "playwright.config.ts — E2E chromium config"
    - "src/test/setup.ts — jest-dom global matchers"
    - "src/lib/db/__tests__/prisma.test.ts — Prisma singleton smoke test (2/2 passing)"
  modified:
    - ".gitignore — added .env.* exceptions, !.env.example, Thumbs.db, .planning/checkpoints/"
    - "pnpm-workspace.yaml — onlyBuiltDependencies for Prisma, esbuild, msw"

decisions:
  - id: "prisma-7-adapter-pattern"
    decision: "Prisma 7 removes url/directUrl from schema.prisma — moved to prisma.config.ts (DIRECT_URL for migrations) and @prisma/adapter-pg Pool for runtime (DATABASE_URL pooled)"
    rationale: "Prisma 7 breaking change discovered during prisma generate. The new pattern separates migration URL config (prisma.config.ts) from runtime adapter config (PrismaClient constructor)"
    impact: "All downstream plans must use import { prisma } from '@/lib/db/prisma' — no other PrismaClient instantiation"
  - id: "zod-4-url-api"
    decision: "Zod 4 provides standalone z.url() — used in env.ts instead of z.string().url()"
    rationale: "Zod 4 added first-class URL validation via z.url()"
    impact: "Minor — both z.url() and z.string().url() work in Zod 4"
  - id: "next-16-scaffold"
    decision: "create-next-app@latest installed Next.js 16.1.6 (not 15 as planned)"
    rationale: "Latest Next.js is now 16.x — no functional difference for this project"
    impact: "None — Next.js 16 maintains full App Router API compatibility"

metrics:
  tasks-completed: 4
  tasks-planned: 4
  tests-added: 2
  tests-passing: 2
  duration: "~30 minutes"
  completed: "2026-03-01"
---

# Phase 1 Plan 01: Scaffold — Next.js 15 + Prisma + Supabase + Folder Structure Summary

**One-liner:** Next.js 16 + Prisma 7 adapter-pg scaffold with TypeScript strict, Tailwind 4, dual-URL Supabase config, and Vitest/Playwright testing infrastructure.

## Objective Achieved

Bootstrapped the complete technical substrate: runnable Next.js application, Prisma 7 schema with profiles/api_keys tables adapted to Prisma 7's new datasource config pattern, canonical folder structure per ADR-001, environment variable validation, migration SQL, Supabase setup documentation, and testing infrastructure with 2 passing smoke tests.

## Tasks Completed

| Task | Name | Commit | Status |
|------|------|--------|--------|
| 1 | Initialize Next.js 15 with TypeScript strict, Tailwind 4, folder structure | e04b6b4 | Done |
| 2 | Install and configure Prisma 7 with dual connection strings and initial schema | 0261fa1 | Done |
| 3 | Create Supabase migration files and setup script | 5375382 | Done |
| 4 | Install Vitest and Playwright testing infrastructure | 97fe70b | Done |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma 7 breaking change — url/directUrl removed from schema.prisma**

- **Found during:** Task 2 (pnpm db:generate)
- **Issue:** Prisma 7 removed `url` and `directUrl` datasource properties from `schema.prisma`. The plan was written expecting Prisma 6 API.
- **Fix:** Created `prisma.config.ts` using `defineConfig({ datasource: { url: DIRECT_URL } })` for migrations. Updated `src/lib/db/prisma.ts` to use `@prisma/adapter-pg` + `pg.Pool` for runtime connections.
- **Additional packages installed:** `@prisma/adapter-pg@7.4.2`, `pg@8.19.0`, `@types/pg@8.18.0`
- **Files modified:** `prisma/schema.prisma` (removed url/directUrl), `prisma.config.ts` (new), `src/lib/db/prisma.ts` (adapter pattern)
- **Commits:** 0261fa1

**2. [Rule 1 - Bug] vitest-environment-jsdom does not exist on npm**

- **Found during:** Task 4 (pnpm add)
- **Issue:** Package `vitest-environment-jsdom` referenced in plan does not exist on npm registry.
- **Fix:** Installed `jsdom` directly — Vitest's `environment: "jsdom"` config uses the `jsdom` package directly.
- **Commits:** 97fe70b

**3. [Rule 3 - Blocking] create-next-app blocked by existing project files**

- **Found during:** Task 1
- **Issue:** `pnpm create next-app@latest .` refuses to run in non-empty directory containing `.planning/`, `CATALOG.md`, etc.
- **Fix:** Scaffolded into a temporary directory `next-scaffold-temp`, then copied files to project root. Temporary directory cleaned up after.
- **Commits:** e04b6b4

**4. [Rule 3 - Blocking] pnpm build script approvals needed for Prisma, esbuild, msw**

- **Found during:** Tasks 2, 4
- **Issue:** pnpm v10 requires explicit approval for build scripts. Prisma, esbuild, and msw all needed build script approval.
- **Fix:** Added `onlyBuiltDependencies` to `pnpm-workspace.yaml` for all affected packages.
- **Commits:** 0261fa1, 97fe70b

**5. [Rule 1 - Info] Next.js 16.1.6 installed instead of 15**

- **Found during:** Task 1
- **Issue:** `create-next-app@latest` installed Next.js 16.1.6 (latest) instead of 15.
- **Impact:** None — API compatibility maintained. Next.js 16 is a compatible upgrade.
- **No fix needed.**

## Next Phase Readiness

**Plan 01-02 (Auth+RBAC) can proceed:**
- `import { prisma } from '@/lib/db/prisma'` — singleton available with pg adapter
- `prisma/schema.prisma` — profiles and api_keys tables ready to extend with sessions
- `.env.example` — all Supabase auth variables documented
- Route groups `(auth)` and `(dashboard)` created

**Key constraint for all downstream plans:**
- Prisma 7 uses adapter pattern — `prisma.config.ts` must have `DIRECT_URL` for migrations
- Runtime `PrismaClient` uses `@prisma/adapter-pg` with `DATABASE_URL` pooled connection
- Never use `new PrismaClient()` outside `src/lib/db/prisma.ts`

## Authentication Gates

None — this plan had no external service authentication requirements.

## Verification

- `pnpm test:run` — 2/2 tests pass (Prisma singleton smoke test)
- `pnpm db:generate` — Prisma client generates successfully from schema
- Next.js build structure: App Router layout hierarchy correctly scaffolded
- Folder structure: matches ADR-001 conventions
