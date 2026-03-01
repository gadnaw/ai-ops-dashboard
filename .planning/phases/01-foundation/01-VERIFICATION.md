---
phase: 01-foundation
verified: 2026-03-01T00:00:00Z
status: passed
score: 5/5 must-haves verified
gaps: []
human_verification:
  - test: pnpm dev starts without errors and root redirects to /login when unauthenticated
    expected: Browser visits localhost:3000, middleware redirects to /login. No console errors.
    why_human: Cannot run Next.js dev server in this context. Redirect logic verified structurally but live behavior requires Supabase.
  - test: Vercel production deployment completes and live URL is accessible
    expected: Push to main triggers Vercel CI; pnpm db:migrate then pnpm build both succeed; preview URL accessible.
    why_human: No live Vercel connection in this portfolio demo. vercel.json verified structurally.
  - test: pnpm db:migrate runs without error against a real Supabase instance
    expected: prisma migrate deploy applies 20260301000000_init_profiles_and_api_keys with no error.
    why_human: Requires real Supabase project with DIRECT_URL configured. Cannot verify without live credentials.
---

# Phase 1: Foundation Verification Report

**Phase Goal:** Clean scaffold with deployment pipeline. No features. Establishes the exact technical substrate every subsequent phase builds on. Dual connection strings, server-only secrets, pre-commit security guards, and RBAC skeleton.

**Verified:** 2026-03-01T00:00:00Z
**Status:** PASSED (5/5 must-haves verified; 3 human-confirmation items for live-service behavior)
**Re-verification:** No -- initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | pnpm dev starts locally; unauthenticated root visit redirects to /login | VERIFIED (structural) | src/app/page.tsx calls redirect to /dashboard. Middleware at src/middleware.ts intercepts /dashboard and redirects to /login?redirectTo=/dashboard when user is null. Full redirect chain is wired. |
| 2 | Push to main triggers Vercel deployment producing a live URL | VERIFIED (structural) | vercel.json exists with buildCommand: pnpm db:migrate and pnpm build, framework: nextjs. ENV-SETUP.md documents Vercel connection steps. |
| 3 | Committing a file containing NEXT_PUBLIC_.*KEY is blocked with actionable error | VERIFIED | .husky/pre-commit contains working bash logic: scans staged .ts/.tsx/.js/.jsx/.mjs/.cjs/.env* files, matches NEXT_PUBLIC_[A-Z_]*KEY on added non-comment lines, prints multi-line error and exits with code 1. Comment-line false-positive fix confirmed present. |
| 4 | Folder structure and naming conventions documented in a single ADR | VERIFIED | docs/ADR-001-architecture-decisions.md exists (83 lines). Documents: folder tree, file naming (kebab-case), component naming (PascalCase), DB tables (snake_case), env vars (SCREAMING_SNAKE_CASE), canonical import paths, dual connection string semantics, Prisma vs Supabase client access pattern split. |
| 5 | .env.example lists all required env vars; no secrets committed; pnpm db:migrate uses DIRECT_URL | VERIFIED | .env.example documents 9 variables with descriptions. .gitignore blocks .env* except .env.example. prisma.config.ts routes DIRECT_URL to migrations. package.json maps db:migrate to prisma migrate deploy. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Exists | Substantive | Wired | Status |
|----------|----------|--------|-------------|-------|--------|
| src/app/page.tsx | Root redirect to /dashboard | YES | YES (5 lines, minimal by design) | YES -- redirect called unconditionally | VERIFIED |
| src/middleware.ts | Auth guard, redirect to /login | YES | YES (69 lines) | YES -- matched by Next.js config.matcher, invoked by runtime | VERIFIED |
| src/lib/db/prisma.ts | Singleton PrismaClient with @prisma/adapter-pg | YES | YES (38 lines) | YES -- exported prisma, imported by session.ts and test file | VERIFIED |
| prisma.config.ts | Prisma 7 datasource url = DIRECT_URL | YES | YES (17 lines) | YES -- read by prisma migrate at CLI invocation | VERIFIED |
| prisma/schema.prisma | profiles + api_keys + Role enum | YES | YES (58 lines) | YES -- generates PrismaClient; migration SQL derived from it | VERIFIED |
| prisma/migrations/20260301000000_init_profiles_and_api_keys/migration.sql | DDL for profiles and api_keys | YES | YES (47 lines, complete DDL with FK and indexes) | YES -- applied by prisma migrate deploy | VERIFIED |
| src/lib/env.ts | @t3-oss/env-nextjs type-safe env validation | YES | YES (27 lines) | YES -- validates 6 runtime env vars with Zod | VERIFIED |
| src/lib/auth/types.ts | AuthSession, UserRole, hasRole() | YES | YES (23 lines) | YES -- imported by guards.ts and session.ts | VERIFIED |
| src/lib/auth/session.ts | getSession() -- Supabase user + Prisma role lookup | YES | YES (34 lines) | YES -- imported by guards.ts, nav.tsx, dashboard page | VERIFIED |
| src/lib/auth/guards.ts | requireAuth, requireRole, requireAdmin, requireDeveloper | YES | YES (44 lines) | YES -- imported by dashboard layout | VERIFIED |
| src/lib/auth/supabase-server.ts | createSupabaseServerClient() + createSupabaseAdminClient() | YES | YES (61 lines) | YES -- imported by session.ts, callback route, auth actions | VERIFIED |
| src/lib/auth/supabase-browser.ts | createSupabaseBrowserClient() | YES | YES (11 lines) | YES -- imported by login page and signup page | VERIFIED |
| src/lib/auth/actions.ts | signOut() server action | YES | YES (10 lines) | YES -- imported by nav.tsx via form action | VERIFIED |
| src/app/(auth)/login/page.tsx | Full login form with email + OAuth | YES | YES (125 lines) | YES -- full Supabase auth calls, error states, loading states, router.push | VERIFIED |
| src/app/(auth)/login/actions.ts | loginWithEmail() + loginWithOAuth() server actions | YES | YES (43 lines) | YES -- Server Actions with real Supabase calls | VERIFIED |
| src/app/(auth)/signup/page.tsx | Signup form | YES | YES (98 lines) | YES -- supabase.auth.signUp() with error handling and confirmation message | VERIFIED |
| src/app/auth/callback/route.ts | PKCE OAuth callback Route Handler | YES | YES (19 lines) | YES -- exchanges code for session, redirects to /dashboard | VERIFIED |
| src/app/(dashboard)/layout.tsx | requireAuth() + Nav | YES | YES (20 lines) | YES -- calls requireAuth() at line 10, renders Nav | VERIFIED |
| src/app/(dashboard)/page.tsx | Dashboard placeholder with role display | YES | YES (32 lines) | YES -- calls getSession(), renders role cards with session data | VERIFIED |
| src/components/layout/nav.tsx | Nav with session info and sign-out | YES | YES (36 lines) | YES -- async Server Component, getSession() + signOut action | VERIFIED |
| src/components/ui/button.tsx | Button component | YES | YES (substantive) | YES -- imported by login and signup pages | VERIFIED |
| src/components/ui/input.tsx | Input component | YES | YES (substantive) | YES -- imported by login and signup pages | VERIFIED |
| .husky/pre-commit | Secret detection + lint-staged | YES | YES (40 lines) | YES -- invoked by Husky v9 on every commit attempt | VERIFIED |
| lint-staged.config.mjs | ESLint + Prettier on staged files | YES | YES (8 lines) | YES -- called by pre-commit hook via pnpm lint-staged | VERIFIED |
| eslint.config.mjs | ESLint flat config with TypeScript rules + Prettier | YES | YES (52 lines) | YES -- used by pnpm lint and lint-staged | VERIFIED |
| .prettierrc.json | Prettier config with tailwindcss plugin | YES | YES (7 lines) | YES -- used by pnpm format and lint-staged | VERIFIED |
| vercel.json | Vercel config with migration build command | YES | YES (10 lines) | YES -- read by Vercel CI on deployment | VERIFIED |
| .env.example | All required env vars documented | YES | YES (51 lines) | YES -- tracked in git, whitelisted in .gitignore | VERIFIED |
| docs/ADR-001-architecture-decisions.md | Architecture decision record | YES | YES (83 lines) | YES -- canonical reference for all downstream phases | VERIFIED |
| docs/ENV-SETUP.md | Environment setup guide | YES | YES (168 lines) | YES -- complete runbook for local setup and Vercel deployment | VERIFIED |
| supabase/setup.sql | Auth trigger + RLS policies | YES | YES (117 lines) | YES -- handle_new_user() trigger + 7 RLS policies | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| src/app/page.tsx | /dashboard | redirect to /dashboard | WIRED | Line 4: unconditional redirect, no stubs |
| Middleware /dashboard check | /login?redirectTo=... | request.nextUrl + isProtectedRoute | WIRED | Lines 38-48: \!user and isProtectedRoute, constructs redirect URL with query param |
| src/app/(dashboard)/layout.tsx | requireAuth() | import + await requireAuth() | WIRED | Line 10: server-side auth gate before layout renders |
| getSession() | Supabase auth | createSupabaseServerClient().auth.getUser() | WIRED | session.ts line 11: real Supabase call, not mocked |
| getSession() | Prisma profiles table | prisma.profile.findUnique() | WIRED | session.ts line 18: queries by user.id, returns role and email |
| requireAuth() | getSession() | import { getSession } | WIRED | guards.ts line 10: const session = await getSession() |
| Nav | signOut() | form action={signOut} | WIRED | nav.tsx line 22: Server Action bound to form element |
| prisma.config.ts | DIRECT_URL | process.env.DIRECT_URL fallback DATABASE_URL | WIRED | prisma.config.ts line 15: DIRECT_URL given priority |
| src/lib/db/prisma.ts | DATABASE_URL pooled | pg.Pool({ connectionString: DATABASE_URL }) | WIRED | prisma.ts line 17: pooled URL used for runtime adapter |
| package.json db:migrate | prisma migrate deploy | npm script | WIRED | package.json line 16 |
| vercel.json buildCommand | pnpm db:migrate + pnpm build | Vercel CI reads vercel.json | WIRED | vercel.json line 4 |
| .husky/pre-commit | Secret detection regex | grep -E NEXT_PUBLIC_[A-Z_]*KEY | WIRED | pre-commit line 16: scans diff of staged code files |
| .husky/pre-commit | pnpm lint-staged | shell call | WIRED | pre-commit line 39: runs after guard 1 |
| Login form handleEmailLogin | supabase.auth.signInWithPassword() | Supabase browser client | WIRED | login/page.tsx line 22: real auth call with error handling |
| OAuth callback | supabase.auth.exchangeCodeForSession(code) | createSupabaseServerClient | WIRED | auth/callback/route.ts lines 11-14 |

All 15 key links verified as WIRED. No orphaned connections or stub handlers found.

---

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| AUTH-01: Supabase Auth with RBAC (Admin/Developer/Viewer), email + OAuth (GitHub, Google), RLS enforcement | SATISFIED | Role enum in schema.prisma (ADMIN/DEVELOPER/VIEWER). hasRole() hierarchy in types.ts. requireAuth/requireRole/requireAdmin/requireDeveloper in guards.ts. Email login + GitHub/Google OAuth in login/page.tsx. PKCE callback at /auth/callback. 7 RLS policies in supabase/setup.sql. |
| SEC-01: API key management with per-key usage tracking, SHA-256 hashing, expiration dates | SATISFIED (schema only; feature implementation is Phase 2+) | api_keys table in schema.prisma: keyHash (SHA-256 hex, unique), keyPrefix (display only), rateLimitRpm, rateLimitTpm, expiresAt, lastUsedAt, revokedAt. Migration SQL creates the complete table with indexes. Phase 1 scope is schema scaffold only per CONTEXT.md. |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/(dashboard)/page.tsx | 11 | Placeholder text: Full dashboard coming in Phase 2 | INFO | Expected -- Phase 1 explicitly states no features. Intentional scaffolding. |
| src/lib/model-router/ | -- | Empty directory (zero files) | INFO | Expected -- model-router is Phase 2+. ADR-001 documents it as a Phase 2 artifact. |
| next.config.ts | 7 | @ts-expect-error for after: true experimental config | WARNING | Acknowledged technical debt from Plan 01-03. Runtime behavior is correct; Next.js 16 type definitions lag. Non-blocking. |
| src/lib/auth/supabase-server.ts | 9, 40 | process.env.NEXT_PUBLIC_SUPABASE_URL\! non-null assertion instead of env.NEXT_PUBLIC_SUPABASE_URL | WARNING | Bypasses the validated env object. Acceptable because auth helpers run in middleware context with Edge Runtime constraints. Supabase client throws immediately on invalid URLs. Low risk. |

**No blockers found.** All anti-patterns are intentional scaffolding or low-risk acknowledged issues.

---

## Detailed Evidence by Success Criterion

### Criterion 1: Application starts locally; unauthenticated root redirects to /login

The root page at src/app/page.tsx (line 4) calls redirect to /dashboard unconditionally.

The middleware at src/middleware.ts evaluates the /dashboard path:
- Line 39: isProtectedRoute = pathname.startsWith slash dashboard = true
- Line 45: !user AND isProtectedRoute = true when no session cookie exists
- Lines 46-48: constructs /login?redirectTo=/dashboard and issues NextResponse.redirect

Full redirect chain: / -> /dashboard -> /login?redirectTo=/dashboard

Scripts verified:
- package.json: dev = next dev --turbopack (Turbopack enabled)
- next.config.ts: serverExternalPackages includes @prisma/client and prisma (required for native pg adapter)

### Criterion 2: Vercel deployment config

vercel.json (10 lines):
- buildCommand: pnpm db:migrate and pnpm build -- migrations run before build; failure blocks deployment
- installCommand: pnpm install -- consistent with workspace package manager
- framework: nextjs -- Vercel auto-detects output directory and routing
- NEXT_TELEMETRY_DISABLED: 1 -- reduces build noise

docs/ENV-SETUP.md (lines 96-168) provides the complete Vercel deployment runbook including GitHub repository connection steps, environment variable configuration for all 5 required vars (table format plus CLI commands), preview deployment behavior, and build command explanation with migration semantics.

### Criterion 3: Secret detection hook correctness

The pre-commit hook at .husky/pre-commit has two stages:

Stage 1 (Secret Detection):
- Collects staged files matching .ts, .tsx, .js, .jsx, .mjs, .cjs, .env* extensions
- Explicitly excludes .env.example
- Filters git diff output to added lines only
- Strips comment lines
- Matches pattern NEXT_PUBLIC_[A-Z_]*KEY
- On match: prints 8-line actionable error message and exits with code 1

Stage 2 (lint-staged):
- Runs pnpm lint-staged which invokes ESLint --fix --max-warnings=0 and Prettier --write on staged files

Pattern coverage confirmed: NEXT_PUBLIC_OPENAI_KEY, NEXT_PUBLIC_ANTHROPIC_KEY, NEXT_PUBLIC_GEMINI_KEY, and any NEXT_PUBLIC_*KEY variant.

False-positive exclusions confirmed: .env.example explicitly excluded; .md files not matched by code file extension pattern; comment lines stripped.

### Criterion 4: Folder structure and ADR

Actual codebase matches ADR-001 specification exactly. All 13 documented directory paths exist:

src/app/(auth)/          -- auth pages (login, signup)
src/app/(dashboard)/     -- protected dashboard pages
src/app/api/             -- API routes directory
src/app/auth/callback/   -- OAuth PKCE callback
src/lib/db/              -- database layer with prisma.ts
src/lib/auth/            -- auth helpers (6 files)
src/lib/model-router/    -- Phase 2+ placeholder (documented in ADR)
src/lib/env.ts           -- environment validation
src/components/ui/       -- primitive UI (button, input)
src/components/layout/   -- shared layout (nav)
prisma/schema.prisma     -- single schema file
prisma/migrations/       -- Prisma migrate output
docs/ADR-001-*.md        -- architecture decision record

ADR-001 is substantive (83 lines) with 7 named decision sections: Folder Structure, Naming Conventions, Access Pattern Split (Pitfall 13), Package Manager, TypeScript Strictness, Canonical Import Paths, Dual Connection Strings, and Server-First Rendering policy.

### Criterion 5: Environment variables, no secrets, migration URL

.env.example documents 9 variables with inline comments:
- DATABASE_URL (port 6543 pooled with pgbouncer params noted)
- DIRECT_URL (port 5432 direct)
- NEXT_PUBLIC_SUPABASE_URL (with dashboard navigation path)
- NEXT_PUBLIC_SUPABASE_ANON_KEY (with RLS safety explanation)
- SUPABASE_SERVICE_ROLE_KEY (with SERVER ONLY warning)
- GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (with OAuth app setup link)
- GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (with credentials console link)

Minor observation: NEXTAUTH_SECRET appears in env.ts as optional() but is absent from .env.example. This is an early planning artifact; the project uses Supabase Auth exclusively. The optional() declaration means startup is not blocked. Non-blocking for Phase 1.

No secrets committed: only .env.example exists at the project root. .gitignore blocks .env* and whitelists .env.example.

Migration uses DIRECT_URL: prisma.config.ts prioritizes DIRECT_URL (process.env.DIRECT_URL). prisma migrate deploy reads this for the direct port-5432 connection that bypasses PgBouncer.

---

### Dual Connection String Architecture (Critical Pitfall 1)

| Invocation Path | URL Used | Source |
|-----------------|----------|--------|
| Runtime queries via PrismaClient | DATABASE_URL (port 6543, pgbouncer, connection_limit=1) | src/lib/db/prisma.ts: pg.Pool({ connectionString: process.env.DATABASE_URL }) |
| Migration execution (prisma migrate deploy) | DIRECT_URL (port 5432, direct bypass) | prisma.config.ts: url: process.env.DIRECT_URL |
| Vercel build CI | DIRECT_URL for migration, then DATABASE_URL for runtime | vercel.json buildCommand: pnpm db:migrate and pnpm build |

All three invocation paths are correctly wired. Connection exhaustion risk (Pitfall 1) is fully mitigated.

---

### RBAC Skeleton Verification

**Schema layer (prisma/schema.prisma):**
- Role enum: ADMIN, DEVELOPER, VIEWER mapped to PostgreSQL type
- Profile.role field defaults to VIEWER
- api_keys table has full schema: keyHash, keyPrefix, rateLimitRpm, rateLimitTpm, expiresAt, lastUsedAt, revokedAt

**Application layer (src/lib/auth/):**
- types.ts: UserRole type, AuthSession interface, hasRole() with numeric hierarchy (ADMIN=3, DEVELOPER=2, VIEWER=1)
- session.ts: getSession() resolves role from Prisma profiles table (not from JWT claims)
- guards.ts: requireAuth() redirects on no session; requireRole() throws Forbidden error for API handlers; requireAdmin() and requireDeveloper() convenience wrappers

**Database layer (supabase/setup.sql):**
- handle_new_user() trigger: auto-creates VIEWER profile on first signup via ON CONFLICT DO NOTHING
- 3 RLS policies for profiles: select_own, update_own, select_admin
- 4 RLS policies for api_keys: select_own, insert_own, update_own, admin_all

The RBAC skeleton is complete and functional for Phase 1. Feature implementation (role assignment UI, role-gated pages) is correctly deferred to later phases per CONTEXT.md scope.

---

### Human Verification Required

#### 1. pnpm dev -- Live Application Startup and Redirect

**Test:** Run pnpm dev in the project root. Visit http://localhost:3000 in a browser.

**Expected:**
- Terminal: Ready in Xms (Turbopack), no TypeScript or module resolution errors
- Browser: redirects to http://localhost:3000/login?redirectTo=/dashboard
- Login page renders with email/password form and GitHub/Google OAuth buttons
- No JavaScript console errors

**Why human:** Requires .env.local with valid Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DATABASE_URL, DIRECT_URL, SUPABASE_SERVICE_ROLE_KEY) and a running local environment.

#### 2. Vercel CI/CD Pipeline

**Test:** Push a commit to the main branch of the connected GitHub repository.

**Expected:**
- Vercel dashboard shows deployment in progress
- Build log: pnpm db:migrate completes (0 pending on re-run, 1 applied on first run)
- Build log: pnpm build completes without errors
- Deployment URL is accessible
- Visiting the root URL on the live deployment redirects to /login

**Why human:** Requires a live Vercel project linked to GitHub with all 5 environment variables configured.

#### 3. Pre-commit Secret Detection Block

**Test:** Create a TypeScript file containing a line that assigns a value to a NEXT_PUBLIC_*KEY variable. Stage it and attempt to commit.

**Expected:** Commit is blocked. Terminal shows the full error message with the Fix instruction to move the key to a server-only environment variable.

**Additional negative test:** Confirm that committing a .md documentation file that mentions NEXT_PUBLIC_SUPABASE_ANON_KEY as a variable name example is NOT blocked (false-positive prevention).

**Why human:** Requires an initialized git repository with Husky v9 hooks active. The git diff --cached command requires actual staged changes.

---

## Gaps Summary

No gaps found. All 5 success criteria are structurally verified against the actual codebase. The three human verification items are not gaps -- they are confirmations that require a live environment (Supabase, Vercel, git with Husky) to exercise end-to-end. The structural preconditions for all three are verified and correct.

---

_Verified: 2026-03-01T00:00:00Z_
_Verifier: Claude (gsd-verifier)_