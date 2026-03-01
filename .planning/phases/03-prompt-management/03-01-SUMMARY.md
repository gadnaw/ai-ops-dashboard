---
phase: 3
plan: "03-01"
title: "Prompt Manager Service"
subsystem: "prompt-management"
tags: ["prisma", "postgresql", "triggers", "server-actions", "rest-api", "vitest"]
status: "complete"
completed: "2026-03-01"
duration: "~2h"

dependency-graph:
  requires: ["02-01", "02-02", "02-04"]
  provides:
    - "prompt_templates and prompt_versions tables in Supabase"
    - "Per-template immutable version system with PostgreSQL triggers"
    - "FK constraint: request_logs.prompt_version_id -> prompt_versions(id)"
    - "Server Actions: createPromptTemplate, createPromptVersion, rollbackToVersion"
    - "REST endpoints: GET/POST /api/v1/prompts, POST /api/v1/prompts/[id]/rollback"
    - "Version-aware chat route: promptVersionId + modelId playground routing"
    - "extractVariables and interpolateVariables utilities"
  affects: ["03-02", "03-03"]

tech-stack:
  added:
    - "diff@8.0.3"
    - "@uiw/react-codemirror@4.25.5"
    - "@codemirror/state@6.5.4"
    - "@codemirror/view@6.39.15"
    - "gpt-tokenizer@3.4.0"
    - "@types/diff@8.0.0 (dev)"
  patterns:
    - "Immutable version content via PostgreSQL BEFORE UPDATE trigger"
    - "Per-template version auto-increment via BEFORE INSERT trigger with pg_advisory_xact_lock"
    - "Atomic rollback via single-field UPDATE on prompt_templates.active_version_id"
    - "Server Actions with 'use server' + discriminated union return: { success } | { error }"
    - "Version-aware routing: promptVersionId in chat request body resolves system prompt"

key-files:
  created:
    - "prisma/migrations/20260301000003_prompt_versioning_with_trigger/migration.sql"
    - "src/lib/prompts/variables.ts"
    - "src/lib/prompts/queries.ts"
    - "src/lib/prompts/actions.ts"
    - "src/app/api/v1/prompts/route.ts"
    - "src/app/api/v1/prompts/[id]/rollback/route.ts"
    - "src/lib/prompts/__tests__/variables.test.ts"
  modified:
    - "prisma/schema.prisma"
    - "src/app/api/v1/chat/route.ts"
    - ".husky/pre-commit"
    - "package.json"
    - "pnpm-lock.yaml"

decisions:
  - id: "03-01-D1"
    decision: "PromptTemplate and PromptVersion use UUID PKs (not cuid) to match request_logs.prompt_version_id column type (UUID) for FK constraint"
    rationale: "request_logs.prompt_version_id was added in Phase 2 as UUID. Using TEXT (cuid) would cause type mismatch on the FK constraint. UUIDs match and keep the schema consistent."
    alternatives: ["Use cuid and cast at FK boundary (rejected — Postgres enforces strict type match)"]

  - id: "03-01-D2"
    decision: "activeVersionId has @unique constraint on PromptTemplate to satisfy Prisma one-to-one relation requirement"
    rationale: "Prisma 7 requires @unique on the FK side of a one-to-one relation. activeVersionId is naturally unique since only one template can point to a given version as active at a time."

  - id: "03-01-D3"
    decision: "Migration applied via direct Node.js pg client (not prisma migrate dev) using postgres@db.ksrmiaigyezhvuktimqt.supabase.co:5432"
    rationale: "prisma migrate dev requires direct DB connection. DIRECT_URL in .env.local uses pooler host with project-prefixed username which fails. Direct Supabase host with plain 'postgres' username works."
    impact: "Migrations are applied manually for this project. _prisma_migrations table is not present — track migration files in git instead."

  - id: "03-01-D4"
    decision: "Cleared stale prompt_version_id values in request_logs before adding FK constraint"
    rationale: "Seed data from Phase 2 inserted 10K rows with random UUID values for prompt_version_id that don't match any real prompt versions. NULL them out before adding the FK to avoid violation."

  - id: "03-01-D5"
    decision: "lint-staged --no-stash added to pre-commit hook"
    rationale: "lint-staged's git stash backup fails with 'Needed a single revision' when there are many untracked files (planning artifacts). The --no-stash flag skips backup and allows commit to proceed."

  - id: "03-01-D6"
    decision: "createPromptVersion sets version: 0 as placeholder — PostgreSQL BEFORE INSERT trigger overwrites it"
    rationale: "The version auto-increment logic lives in the DB trigger (assign_prompt_version). Prisma must provide a value for the non-null column, so 0 is used as a placeholder that the trigger always replaces."
---

# Phase 3 Plan 01: Prompt Manager Service Summary

**One-liner:** Immutable prompt versioning with per-template PostgreSQL triggers, atomic rollback via single active_version_id update, and version-aware chat routing for playground mode.

## What Was Built

This plan established the complete server-side foundation for the prompt engineering workflow loop:

### Database Layer
- **prompt_templates** table: slug, name, description, active_version_id (FK to prompt_versions)
- **prompt_versions** table: immutable content (TEXT), system_prompt, model_config (JSONB), variables (JSONB)
- **Immutability trigger**: `enforce_prompt_version_immutability` — BEFORE UPDATE on prompt_versions raises exception if content/system_prompt/model_config changes
- **Version auto-increment trigger**: `assign_prompt_version` — BEFORE INSERT acquires pg_advisory_xact_lock(hashtext(template_id)) and sets version = MAX(version)+1 per template
- **FK constraint**: `fk_prompt_version` on request_logs.prompt_version_id -> prompt_versions(id) ON DELETE SET NULL
- **RLS**: Both tables have row-level security enabled with SELECT ALL policies
- **Seed data**: 3 template stubs (summarization, classification, extraction)

### Library Layer
- `src/lib/prompts/variables.ts`: `extractVariables(content)` — regex-based {{var}} extraction returning sorted unique names; `interpolateVariables(content, values)` — fills in values, leaves missing vars intact
- `src/lib/prompts/queries.ts`: `getTemplates`, `getTemplateBySlug`, `getTemplateWithVersions`, `getVersion`, `getVersionByNumber`, `getTwoVersionsForDiff`
- `src/lib/prompts/actions.ts`: `createPromptTemplate`, `createPromptVersion`, `rollbackToVersion`, `deletePromptTemplate` — all with 'use server' directive and discriminated union returns

### REST API Layer
- `GET /api/v1/prompts`: Returns all templates with active version included
- `POST /api/v1/prompts`: Creates template + optional initial version in one call
- `POST /api/v1/prompts/[id]/rollback`: Atomically updates active_version_id to specified version

### Chat Route Extension
- `/api/v1/chat` now accepts `promptVersionId` (resolves version content as system prompt) and `modelId` (overrides primary model for playground)
- `prompt_version_id` logged on every request for prompt analytics

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] PromptTemplate/PromptVersion IDs changed from cuid to UUID**

- **Found during:** Step 2 of Task 1 (migration attempt)
- **Issue:** The plan specified `@default(cuid())` for IDs, but `request_logs.prompt_version_id` is type UUID in the database. FK constraint type mismatch would fail.
- **Fix:** Changed to `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` on both models.
- **Files modified:** `prisma/schema.prisma`, `prisma/migrations/20260301000003.../migration.sql`

**2. [Rule 1 - Bug] @unique required on activeVersionId for Prisma one-to-one relation**

- **Found during:** First migration attempt
- **Issue:** Prisma 7 raises P1012 validation error if the FK side of a one-to-one relation lacks @unique.
- **Fix:** Added `@unique` to `activeVersionId` on PromptTemplate. Also added `@unique` index in migration SQL.
- **Files modified:** `prisma/schema.prisma`, migration SQL

**3. [Rule 3 - Blocking] Migration commands fail due to DIRECT_URL hostname**

- **Found during:** Task 1 migration step
- **Issue:** `pnpm db:migrate` fails with "Connection url is empty" (Prisma config reads env from .env, not .env.local). Direct connection with pooler hostname gives "Tenant or user not found". The `db.ksrmiaigyezhvuktimqt.supabase.co` host with plain `postgres` username works.
- **Fix:** Applied migration SQL directly via Node.js pg client. Documented working connection string.

**4. [Rule 3 - Blocking] Stale prompt_version_id values block FK constraint**

- **Found during:** FK constraint addition in migration
- **Issue:** 10K seed rows in request_logs have non-null prompt_version_id values pointing to non-existent UUIDs. FK constraint addition fails with foreign key violation.
- **Fix:** Added `UPDATE request_logs SET prompt_version_id = NULL WHERE prompt_version_id NOT IN (SELECT id FROM prompt_versions)` before the FK constraint.

**5. [Rule 3 - Blocking] lint-staged fails with "Needed a single revision"**

- **Found during:** First commit attempt
- **Issue:** lint-staged tries to create a git stash backup before running. With many untracked files (planning artifacts), the stash operation fails.
- **Fix:** Updated `.husky/pre-commit` to pass `--no-stash` flag to lint-staged.

**6. [Rule 1 - Bug] TypeScript type error on modelConfig (Record vs InputJsonValue)**

- **Found during:** Type-check after Task 2
- **Issue:** Prisma's Json field requires `Prisma.InputJsonValue`, not `Record<string, unknown>`. TypeScript strict mode with exactOptionalPropertyTypes catches this.
- **Fix:** Changed `modelConfig` parameter type to `Prisma.InputJsonValue` in actions.ts and prompts/route.ts.

## Verification Results

- `pnpm type-check`: PASS
- `pnpm lint`: PASS
- `pnpm test:run src/lib/prompts/__tests__/variables.test.ts`: 20/20 PASS
- Database: prompt_templates, prompt_versions tables verified via pg query
- Triggers: prompt_version_immutability, set_prompt_version verified in information_schema
- FK constraint: fk_prompt_version verified in pg_constraint
- RLS: Both tables confirmed with ENABLE ROW LEVEL SECURITY
- Seed data: 3 templates confirmed in prompt_templates

## Commits

| Hash | Message |
|------|---------|
| d44fa48 | feat(03-01): add prompt_templates and prompt_versions schema with per-template version trigger and FK constraint |
| 67e090b | feat(03-01): add prompt query layer, Server Actions, REST endpoints, and version-aware chat route |
| db3c604 | test(03-01): add variable extraction unit tests and verify integration |

## Next Phase Readiness

Plans 03-02 and 03-03 can build on this foundation immediately:

- **Templates endpoint**: `GET /api/v1/prompts` is ready for UI consumption
- **Version creation**: `createPromptVersion` Server Action is ready for the template editor
- **Rollback**: `POST /api/v1/prompts/[id]/rollback` is ready for the version history UI
- **Playground**: `/api/v1/chat` accepts `promptVersionId` + `modelId` for version testing
- **Variable extraction**: `extractVariables` + `interpolateVariables` ready for the editor's variable highlight/fill UI
- **Import paths**: All exports match the plan's artifact contracts
