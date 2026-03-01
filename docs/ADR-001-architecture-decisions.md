# ADR-001: Architecture Decisions — Foundation

## Status: Accepted

## Context

Establishes conventions all subsequent phases must follow. Deviating from these decisions requires a new ADR.

## Decisions

### Folder Structure

```
src/
  app/                    # Next.js App Router routes
    (auth)/               # Auth pages — login, signup (no shared layout chrome)
    (dashboard)/          # Protected dashboard pages (shared nav/sidebar)
    api/                  # API routes
      v1/                 # Public API (external consumers)
  lib/                    # Server-side services and utilities
    db/                   # Database layer
      prisma.ts           # Singleton Prisma client (canonical import)
    auth/                 # Auth helpers — session, role guards
    model-router/         # Multi-model routing engine (Phase 2)
      registry.ts         # Provider registry (canonical import)
  components/             # Shared React components
    ui/                   # Primitive UI components (buttons, inputs, cards)
prisma/
  schema.prisma           # Single schema file
  migrations/             # Prisma migrate output
  seed.ts                 # Seed script (Phase 2)
docs/
  ADR-001...              # Architecture decision records
```

### Naming Conventions

- Files: `kebab-case.ts` for all files
- React components: `PascalCase` function, `kebab-case` filename
- Database tables: `snake_case`
- TypeScript types/interfaces: `PascalCase`
- Environment variables: `SCREAMING_SNAKE_CASE`
- API routes: `/api/v1/resource` pattern

### Access Pattern Split (Pitfall 13 — RLS + Prisma)

- **Prisma** is used for ALL server-side data access (Server Components, Server Actions, API routes).
  Application-level auth checks are performed before any Prisma query.
- **Supabase JS client** is used ONLY for client-side real-time subscriptions (Supabase Realtime).
  Client component subscriptions use `supabase.channel()` — never for data fetching.
- RLS policies are a defense-in-depth layer, not the primary auth guard.

### Package Manager

`pnpm` only. Do not use `npm` or `yarn` in any script, README, or CI config.

### TypeScript Strictness

`strict: true` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`.
`any` types are banned in production code. Use `unknown` + type guards.

### Canonical Import Paths

- Prisma client: `import { prisma } from '@/lib/db/prisma'`
- Model router registry: `import { registry } from '@/lib/model-router/registry'` (Phase 2+)
- Environment variables: `import { env } from '@/lib/env'`

### Dual Connection Strings

- `DATABASE_URL` — Pooled connection (PgBouncer, port 6543) for runtime queries.
  Always append `?pgbouncer=true&connection_limit=1` for serverless compatibility.
- `DIRECT_URL` — Direct connection (port 5432) for Prisma migrations only.
  Never use for runtime queries.

### Server-First Rendering

`"use client"` is used ONLY on:
- Recharts/chart wrapper components
- Filter dropdowns and form inputs requiring interactivity
- Supabase Realtime feed components

All other components default to Server Components.
