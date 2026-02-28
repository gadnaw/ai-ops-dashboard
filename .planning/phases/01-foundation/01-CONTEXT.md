# Phase 1: Foundation — Context

*Auto-generated from project research and roadmap. Review and edit before planning.*

## Phase Boundary

**Goal:** Clean scaffold with deployment pipeline. No features. Establishes the exact technical substrate every subsequent phase builds on — dual connection strings, server-only secrets, pre-commit security guards, and RBAC skeleton.

**Success Criteria:**
1. `pnpm dev` starts locally with no errors; unauthenticated users redirect to `/login`
2. Push to `main` triggers Vercel deployment producing a live preview URL
3. Attempting to commit `NEXT_PUBLIC_.*KEY` is blocked by the pre-commit hook
4. Folder structure and naming conventions established in an architecture decision record
5. `.env.example` complete; `pnpm db:migrate` runs against Supabase without error

## Requirements In Scope

| REQ-ID | Requirement |
|--------|-------------|
| AUTH-01 | Supabase Auth with RBAC (Admin/Developer/Viewer), email + OAuth (GitHub, Google), RLS enforcement |
| SEC-01 | API key management with per-key usage tracking, SHA-256 hashing, expiration dates |

## What's NOT In Scope

- INFRA-01 (multi-model routing) — Phase 2
- OBS-01, OBS-02 (tracking, dashboard) — Phase 2
- CONFIG-01 (model config UI) — Phase 2
- PROMPT-01, DX-01 — Phase 3
- REL-01, PROMPT-02 — Phase 4
- EVAL-01, ALERT-01 — Phase 5
- No seed data in this phase — just schema and scaffold

## Technical Decisions

- **Next.js 15** with App Router, Turbopack, React 19, TypeScript strict mode
- **Prisma 7** with dual connection strings: `DATABASE_URL` (pooled, port 6543, `?pgbouncer=true`, `connection_limit=1`) and `DIRECT_URL` (direct, port 5432)
- **Supabase Auth** with email + OAuth (GitHub, Google). Three roles: Admin, Developer, Viewer. RLS policies enforce at database layer.
- **API keys** stored SHA-256 hashed. Plaintext shown once at creation. Per-key rate limit overrides and expiration dates.
- **Folder structure:** `src/app/` (routes), `src/lib/` (services), `src/components/` (UI), `prisma/` (schema/migrations/seed)
- **Tailwind CSS 4** for styling
- **ESLint + Prettier** with pre-commit hooks via Husky + lint-staged
- **Pre-commit secret detection:** regex hook blocking `NEXT_PUBLIC_.*KEY` patterns

## Key Risks

- **Pitfall 1 (Connection pooling):** CRITICAL — dual connection strings must be configured from day one. Failure exhausts Supabase connections within minutes.
- **Pitfall 4 (API key exposure):** CRITICAL — pre-commit hook must catch `NEXT_PUBLIC_.*KEY` before any feature code exists.
- **Pitfall 13 (RLS + Prisma):** HIGH — document access pattern split: Prisma for server-side with app-level auth, Supabase client for client-side real-time only.

## Dependencies

None — this is the first phase.

## Claude's Discretion

- Package manager choice (pnpm recommended per research)
- Exact ESLint rule configuration
- Husky vs lefthook for pre-commit hooks
- Exact OAuth provider configuration steps
- Database table naming convention (snake_case recommended)
- Error boundary and loading state patterns
