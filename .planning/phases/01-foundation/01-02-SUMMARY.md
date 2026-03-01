---
phase: 1
plan: "01-02"
title: "Auth + RBAC — Supabase Auth, OAuth, Role Guards, Middleware"
subsystem: auth
tags: [supabase, ssr, auth, rbac, middleware, oauth, next-auth]
completed: "2026-03-01"
duration: "7 minutes"

dependency-graph:
  requires:
    - "01-01: FolderConventions, DatabaseSchema, EnvironmentConfig"
  provides:
    - "AuthHelpers: getSession(), requireAuth(), requireRole() at src/lib/auth/"
    - "MiddlewareAuthGuard: src/middleware.ts protecting /dashboard/*, /api/v1/*, /settings/*, /prompts/*, /playground/*"
    - "SupabaseServerClient: createSupabaseServerClient() + createSupabaseAdminClient()"
    - "SupabaseBrowserClient: createSupabaseBrowserClient() singleton"
    - "LoginUI: /login with email/password + GitHub/Google OAuth, /signup, /auth/callback"
  affects:
    - "01-03: DevOps CI pipeline will lint and type-check new auth files"
    - "02-*: All server actions and route handlers use requireAuth()/requireRole() from this plan"

tech-stack:
  added:
    - "@supabase/supabase-js 2.98.0"
    - "@supabase/ssr 0.8.0"
    - "clsx 2.1.1"
    - "tailwind-merge 3.5.0"
  patterns:
    - "Supabase SSR cookie pattern — createServerClient() with getAll/setAll for App Router"
    - "PKCE OAuth flow — /auth/callback Route Handler exchanges code for session"
    - "Role hierarchy: ADMIN(3) > DEVELOPER(2) > VIEWER(1) via hasRole() type guard"
    - "requireAuth() redirects; requireRole() throws for API handlers"
    - "Nav as async Server Component — reads session server-side, no client state"

key-files:
  created:
    - "src/lib/auth/types.ts"
    - "src/lib/auth/supabase-server.ts"
    - "src/lib/auth/supabase-browser.ts"
    - "src/lib/auth/session.ts"
    - "src/lib/auth/guards.ts"
    - "src/lib/auth/actions.ts"
    - "src/lib/utils.ts"
    - "src/middleware.ts"
    - "src/app/(auth)/login/actions.ts"
    - "src/app/(auth)/signup/page.tsx"
    - "src/app/(auth)/signup/actions.ts"
    - "src/app/auth/callback/route.ts"
    - "src/components/ui/button.tsx"
    - "src/components/ui/input.tsx"
    - "src/components/layout/nav.tsx"
    - "src/app/(dashboard)/page.tsx"
  modified:
    - "src/app/(auth)/login/page.tsx — replaced placeholder with full login form"
    - "src/app/(dashboard)/layout.tsx — added Nav + requireAuth()"

decisions:
  - id: "client-login-form"
    description: "Login and signup pages are Client Components using createSupabaseBrowserClient() directly — avoids Server Action round-trip for form state management (error display, loading state)"
    rationale: "Better UX: immediate error feedback without full page reload. Server actions (actions.ts) also exist for form-based fallback but the primary flow is client-side."
  - id: "dashboard-clean-url"
    description: "Dashboard page placed at src/app/(dashboard)/page.tsx not src/app/(dashboard)/dashboard/page.tsx — renders at /dashboard URL without nested segment"
    rationale: "Per context note in plan — cleaner URL structure. Root page.tsx redirects /→/dashboard."
  - id: "nav-server-component"
    description: "Nav is an async Server Component that calls getSession() server-side — no client-side session fetch or context provider needed"
    rationale: "Keeps session reads on server; Nav doesn't need interactivity except the logout form which uses a Server Action"

metrics:
  tasks-completed: 5
  tasks-total: 5
  commits: 5
  files-created: 16
  files-modified: 3
---

# Phase 1 Plan 02: Auth + RBAC Summary

**One-liner:** Supabase SSR auth with PKCE OAuth, role-hierarchy guards (requireAuth/requireRole/requireAdmin), Next.js middleware protecting 5 route groups, and client-side login/signup UI.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Supabase client factories | 72b57b6 | types.ts, supabase-server.ts, supabase-browser.ts |
| 2 | getSession() + requireRole() helpers | 39d00b4 | session.ts, guards.ts |
| 3 | Next.js middleware | 2601541 | src/middleware.ts |
| 4 | Login, signup, OAuth callback UI | ad94c81 | login/page.tsx, signup/page.tsx, auth/callback/route.ts, button.tsx, input.tsx, utils.ts |
| 5 | Dashboard placeholder + Nav + logout | 9c74dc7 | (dashboard)/page.tsx, (dashboard)/layout.tsx, nav.tsx, lib/auth/actions.ts |

## What Was Built

### Auth Helper Pattern (used by all subsequent phases)

```typescript
// In any Server Action or Route Handler:
import { requireAuth, requireRole, requireAdmin, requireDeveloper } from '@/lib/auth/guards';

// Authentication check — redirects to /login if unauthenticated
const session = await requireAuth();

// Role check — throws Forbidden error (catch in Route Handlers, redirects in Server Actions)
const session = await requireAdmin();     // ADMIN only
const session = await requireDeveloper(); // DEVELOPER or ADMIN
const session = await requireRole("VIEWER"); // VIEWER or higher
```

### Middleware Route Protection

- `/dashboard/*` — requires auth (redirect to `/login?redirectTo=...`)
- `/api/v1/*` — requires auth
- `/settings/*`, `/prompts/*`, `/playground/*` — requires auth
- `/login`, `/signup` — redirects authenticated users to `/dashboard`

### URL Structure

| Route | Component | Auth |
|-------|-----------|------|
| `/` | page.tsx redirect | — |
| `/dashboard` | (dashboard)/page.tsx | requireAuth() in layout |
| `/login` | (auth)/login/page.tsx | public, redirects if authed |
| `/signup` | (auth)/signup/page.tsx | public, redirects if authed |
| `/auth/callback` | Route Handler | OAuth PKCE code exchange |

### Role Hierarchy

```
ADMIN (3) > DEVELOPER (2) > VIEWER (1)
```

`hasRole(session, "DEVELOPER")` returns true for DEVELOPER and ADMIN.

## Decisions Made

1. **Client-side login form:** Login/signup are Client Components using `createSupabaseBrowserClient()` for immediate error feedback and loading states. Server Actions (`actions.ts`) also exist for form-based fallback.

2. **Dashboard at clean `/dashboard` URL:** Page placed at `src/app/(dashboard)/page.tsx` — not `dashboard/dashboard/page.tsx`. Root page redirects `/` → `/dashboard`.

3. **Nav as async Server Component:** Reads session server-side via `getSession()`. No client-side context/hook needed for session display. Logout uses a Server Action via a `<form>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing return path in loginWithOAuth()**

- **Found during:** Task 5 TypeScript type-check
- **Issue:** `loginWithOAuth()` had no return statement when `data.url` was falsy — TS7030: Not all code paths return a value
- **Fix:** Added `return { error: "OAuth provider did not return a redirect URL" }` as fallback
- **Files modified:** `src/app/(auth)/login/actions.ts`
- **Commit:** 9c74dc7

**2. [Rule 3 - Blocking] Pre-existing type errors noted (not fixed — out of scope)**

- `next.config.ts`: `'after' does not exist in type 'ExperimentalConfig'` — pre-existing from Plan 01-01
- `playwright.config.ts`: `workers: number | undefined` exactOptionalPropertyTypes mismatch — pre-existing from Plan 01-01
- These are tracked issues from the scaffold phase, not introduced by this plan

## Next Phase Readiness

**Ready for:** Plan 01-03 (DevOps — CI/CD pipeline, Dockerfile, environment config)

**Ready for (Phase 2+):** All server actions and route handlers can immediately use:
```typescript
import { requireAuth, requireRole, requireAdmin, requireDeveloper } from '@/lib/auth/guards';
```

**Supabase configuration needed before live testing:**
- Auth > URL Configuration > Site URL = production domain
- Auth > URL Configuration > Redirect URLs = `http://localhost:3000/**` for local dev
- Auth > Providers > GitHub and Google OAuth apps configured with client ID/secret
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
