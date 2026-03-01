# Environment Setup Guide

## Prerequisites

- Node.js 20+ (use `nvm use` with `.nvmrc`)
- pnpm (`npm install -g pnpm`)
- A Supabase project (free tier sufficient)

## Setup Steps

### 1. Clone and install dependencies

```bash
git clone https://github.com/USERNAME/REPO.git
cd REPO
pnpm install
# Husky hooks are installed automatically via the "prepare" script
```

### 2. Create environment file

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase credentials (see comments in the file).

### 3. Get Supabase credentials

From your Supabase Dashboard (https://supabase.com/dashboard):

1. **Project Settings > Database > Connection string:**
   - Copy "Transaction pooler" (port 6543) -> `DATABASE_URL`
   - Append: `?pgbouncer=true&connection_limit=1`
   - Copy "Direct connection" (port 5432) -> `DIRECT_URL`

2. **Project Settings > API:**
   - Copy "Project URL" -> `NEXT_PUBLIC_SUPABASE_URL`
   - Copy "anon / public" key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Copy "service_role" key -> `SUPABASE_SERVICE_ROLE_KEY`

### 4. Run database migrations

```bash
pnpm db:migrate:dev
```

### 5. Set up Supabase trigger and RLS

Run the SQL from Plan 01-01 Task 3 in Supabase SQL Editor:

- `handle_new_user()` trigger
- RLS policies for `profiles` and `api_keys` tables

### 6. Start development server

```bash
pnpm dev
```

Visit http://localhost:3000 — you should be redirected to /login.

## Available Scripts

| Script | Description |
| --- | --- |
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Production build |
| `pnpm lint` | Run ESLint on src/ |
| `pnpm lint:fix` | Run ESLint with auto-fix |
| `pnpm format` | Run Prettier on all files |
| `pnpm type-check` | TypeScript type check without emit |
| `pnpm test` | Run Vitest in watch mode |
| `pnpm test:run` | Run Vitest once (CI) |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm db:migrate` | Apply pending migrations (CI/production) |
| `pnpm db:migrate:dev` | Create new migration from schema diff |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm db:studio` | Open Prisma Studio |

## Pre-commit Hooks

The following checks run automatically before every commit:

1. **Secret detection** — blocks any staged non-comment line containing `NEXT_PUBLIC_.*KEY` pattern
2. **ESLint** — auto-fixes where possible, fails on warnings (--max-warnings=0)
3. **Prettier** — auto-formats staged files

To bypass in emergencies (strongly discouraged):

```bash
git commit --no-verify -m "emergency: ..."
```

## Vercel Deployment

### Prerequisites

- A Vercel account (free tier sufficient for demo)
- GitHub repository with this codebase

### Steps

1. **Push to GitHub:**

```bash
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

2. **Connect to Vercel:**

   - Visit https://vercel.com/new
   - Import your GitHub repository
   - Vercel auto-detects Next.js and uses settings from `vercel.json`

3. **Set environment variables in Vercel Dashboard:**

   Go to Project > Settings > Environment Variables and add:

   | Variable | Environment |
   | --- | --- |
   | `DATABASE_URL` | Production, Preview |
   | `DIRECT_URL` | Production, Preview |
   | `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview |
   | `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview |

   Or use the Vercel CLI:

   ```bash
   pnpm add -g vercel
   vercel link
   vercel env add DATABASE_URL production
   vercel env add DIRECT_URL production
   vercel env add NEXT_PUBLIC_SUPABASE_URL production
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   ```

4. **Deploy:**

   Push to `main` triggers automatic production deployment.
   Or run `vercel --prod` for manual deploy.

5. **Verify deployment:**

   - Visit the deployment URL (e.g., `https://ai-ops-dashboard.vercel.app`)
   - Confirm `/` redirects to `/dashboard`
   - Confirm `/dashboard` redirects to `/login` (unauthenticated)
   - Confirm login page renders without errors

### Build Command

The `vercel.json` build command runs:

```
pnpm db:migrate && pnpm build
```

- `pnpm db:migrate` runs `prisma migrate deploy` using `DIRECT_URL` (direct connection, bypasses PgBouncer)
- Fails the build if any pending migration cannot be applied
- `pnpm build` runs `next build` after successful migration

### Preview Deployments

Preview deployments are automatic on all PRs. When a PR is opened against `main`, Vercel builds and deploys a preview URL automatically. No additional configuration needed.
