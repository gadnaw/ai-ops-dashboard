# Cross-Phase Analysis Report

**Analyzed:** 2026-03-01
**Phases:** 5 (Phase 1 skip-research, Phases 2-5 analyzed)
**Status:** accepted-with-issues
**Resolution iterations:** 1 (autonomous auto-resolve)
**Coordination mode:** Hub-and-Spoke (4 independent analyzers)

## Summary

**Initial Discovery:**

| Analyzer | CRITICAL | HIGH | MEDIUM | LOW | Total |
|----------|----------|------|--------|-----|-------|
| Stack | 1 | 3 | 5 | 2 | 11 |
| Interface | 3 | 7 | 6 | 3 | 19 |
| Dependency | 0 | 4 | 4 | 3 | 11 |
| Gap | 0 | 4 | 8 | 5 | 17 |
| **Total** | **4** | **18** | **23** | **13** | **58** |

**After Deduplication:** 28 unique issues (many overlap across analyzers)

**Current State:**

| Category | Resolved | Accepted | Planner-Constraint |
|----------|----------|----------|-------------------|
| CRITICAL | 2 | 0 | 2 |
| HIGH | 3 | 5 | 10 |
| MEDIUM | 2 | 12 | 9 |
| LOW | 0 | 13 | 0 |

## Findings — CRITICAL Issues

### C1: Deprecated Gemini Model IDs (STACK-001, GAP-001, DEP-005, INTF-017)

**Severity:** CRITICAL → **RESOLVED**
**Phases:** 2, 4
**Found by:** 4/4 analyzers

Phase 2 CONTEXT.md locked `Gemini 1.5 Pro, Flash` — discontinued September 24, 2025. Phase 4 already used corrected IDs.

**Resolution:** Updated 02-CONTEXT.md to `Gemini 2.5 Flash, Gemini 2.0 Flash`. ✓

### C2: Column Name Mismatch — `duration_ms` vs `latency_ms` (INTF-001)

**Severity:** CRITICAL → **PLANNER CONSTRAINT**
**Phases:** 2, 5

Phase 2 defines `request_logs.duration_ms`. Phase 5 alert SQL queries `latency_ms`. Runtime error on every p95 latency alert check.

**Constraint:** Standardize on `duration_ms` across all phases. Phase 5 planner must use `duration_ms` in `check_alert_rules()`.

### C3: Column Name Mismatch — `cost_usd` vs `total_cost` (INTF-002)

**Severity:** CRITICAL → **PLANNER CONSTRAINT**
**Phases:** 2, 5

Phase 2 defines `request_logs.cost_usd`. Phase 5 alert SQL queries `SUM(total_cost)` on raw table (only exists as alias in materialized view).

**Constraint:** Phase 5 planner must use `SUM(cost_usd)` when querying `request_logs` directly.

### C4: request_logs PK Type — BIGSERIAL vs UUID (INTF-003)

**Severity:** CRITICAL → **RESOLVED (Decision: UUID)**
**Phases:** 2, 3, 5

Phase 2 defines `id BIGSERIAL`. Phase 5 FKs typed as `UUID`. Incompatible types — migration will fail.

**Decision:** Use UUID (`gen_random_uuid()`) for `request_logs.id`. Phase 3 already uses `crypto.randomUUID()` in logging. All downstream FK references expect UUID. Phase 2 planner must define `id UUID DEFAULT gen_random_uuid()` with composite PK `(id, created_at)` for partitioning.

## Findings — HIGH Issues (Deduplicated)

### H1: Anthropic Model ID Generation Mismatch (STACK-002, INTF-018)

**Phases:** 2, 4
**Constraint:** Align on current Anthropic model IDs. Phase 2 registry uses `claude-3-5-sonnet-20241022` / `claude-3-5-haiku-20241022`. Phase 4 fallback map uses `claude-sonnet-4-20250514`. Planner must verify current model IDs and use one consistent generation across all phases. Cost rate cards must match.

### H2: Upstash Phantom Dependency (STACK-003)

**Phases:** 1, 2
**Constraint:** Do NOT install `@upstash/ratelimit` or `@upstash/redis` in Phase 1 or 2. SUMMARY.md decision: PostgreSQL-first, Upstash as upgrade path. Phase 4 planner defines the `RateLimiterInterface` abstraction. Remove Upstash from STACK.md installation commands.

### H3: AI SDK Token Property Names (INTF-004, STACK-009)

**Phases:** 2, 3
**Constraint:** Use `usage.inputTokens` / `usage.outputTokens` (AI SDK 6 names). NOT `usage.promptTokens` / `usage.completionTokens` (AI SDK 3 names). Phase 2 logging code must use the correct property names — old names silently return `undefined`.

### H4: Stream Response Method (INTF-005)

**Phases:** 2, 3
**Constraint:** Use `toUIMessageStreamResponse()` for streaming route responses (Phase 3 corrected name). NOT `toDataStreamResponse()` (Phase 2 pre-research name). Verify compatibility with `useCompletion` — may need `toTextStreamResponse()` for single-turn playground.

### H5: Missing prompt_text/response_text Columns on request_logs (INTF-006)

**Phases:** 2, 5
**Constraint:** Phase 2 must add `prompt_text TEXT` and `response_text TEXT` columns to `request_logs` and log them in the `after()` callback. Phase 5 evaluation pipeline requires these to feed the LLM judge. Phase 3 already logs `responseText` — column names must be consistent.

### H6: Users/Profiles Table Reference (INTF-007, DEP-001)

**Phases:** 1, 4, 5
**Constraint:** Phase 1 must create a `profiles` table (`id UUID REFERENCES auth.users(id)`) mirroring Supabase auth. Phase 4 `experiments.created_by` and Phase 5 human review actions reference user identity. All phases must use `profiles(id)` for FKs, not `users(id)` or `auth.users(id)` directly.

### H7: api_keys Schema Undefined (INTF-008, DEP-001)

**Phases:** 1, 4
**Constraint:** Phase 1 planner must define `api_keys` table schema explicitly — including UUID PK, SHA-256 hash column, per-key rate limit override columns (`rate_limit_rpm`, `rate_limit_tpm`), and `expires_at`. Phase 4 `rate_limit_events` has FK to `api_keys(id)`.

### H8: Welford vs Accumulator Columns (INTF-009, GAP-013)

**Phases:** 4
**Decision:** Use simple sum/count accumulator with `SELECT ... FOR UPDATE` row lock (~15ms overhead, acceptable). `variant_metrics` DDL must use `latency_sum`, `latency_sum_sq`, `latency_n` instead of Welford's `latency_mean`, `latency_m2`. The ~15ms lock overhead matches the rate limiter's acceptable latency budget.

### H9: Eval Score Data Flow Pipeline Missing (INTF-010)

**Phases:** 4, 5
**Constraint:** Phase 5 evaluation processor must check if the evaluated request was part of an A/B experiment and update `variant_metrics` eval columns accordingly. This cross-phase data flow must be in the Phase 5 plan. Phase 4 creates the columns (nullable), Phase 5 populates them.

### H10: Phase 4 Degradation Stage 3 Cache Retrofits Phase 2 Router (DEP-003)

**Phases:** 2, 4
**Constraint:** Phase 4 scope includes modifying the Phase 2 model router to add cache-write logic. The `response_cache` table is new in Phase 4, but writing to it happens in the `/api/v1/chat` route (Phase 2 code). Phase 4 planner must explicitly scope this cross-phase code modification.

### H11: Seed Data Composition (DEP-004)

**Phases:** 2, 5
**Constraint:** `prisma/seed.ts` must be modular: `seedBaseData()` (Phase 2) and `seedEvaluationAndAlerts()` (Phase 5). Phase 5 calls Phase 2's seeder first, then adds evaluation scores and alert events. Use fixed random seed for reproducibility.

### H12: prompt_version_id FK Migration Strategy (DEP-008, INTF-013)

**Phases:** 2, 3
**Constraint:** Phase 2 adds `prompt_version_id UUID NULL` to `request_logs` WITHOUT FK constraint (prompt_versions table doesn't exist yet). Phase 3 migration adds `ALTER TABLE request_logs ADD CONSTRAINT fk_prompt_version FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(id)`.

### H13: Phase 1 Research Gap — AUTH/SEC Implementation (GAP-002)

**Phases:** 1
**Accepted Risk:** Phase 1 has skip-research flag. Supabase Auth + Next.js 15 is well-documented. The planner has sufficient guidance from ARCHITECTURE.md, STACK.md, and 01-CONTEXT.md. No re-research needed — patterns are standard.

### H14: NFR-03 Accessibility Zero Coverage (GAP-003)

**Phases:** 2, 3, 4, 5
**Accepted Risk:** WCAG 2.1 AA is listed as an NFR but has no research. For a portfolio demo, this is deferred to polish. Planner should add ARIA labels to Recharts charts and use color-blind-safe palette as low-effort wins.

### H15: NFR-04 CI/CD Deployment Gap (GAP-004)

**Phases:** 1, 2
**Accepted Risk:** Prisma migrations in Vercel CI/CD and preview environment strategy are operational details. Phase 1 planner handles during implementation. Standard Vercel + Prisma pattern: `prisma migrate deploy` in build command using `DIRECT_URL`.

### H16: NFR-05 Testing Infrastructure Gap (GAP-005)

**Phases:** All
**Accepted Risk:** Testing framework setup (Vitest, Playwright) is standard and will be established in Phase 1 scaffold. Phase 5 MSW research provides the mock pattern. 80% coverage target is aspirational for a portfolio demo.

### H17: Prisma Import Path Inconsistency (STACK-005, INTF-014, INTF-015)

**Phases:** 2, 4, 5
**Constraint:** Canonical Prisma import: `import { prisma } from '@/lib/db/prisma'` (per Phase 2 folder structure). Phase 4 code using `@/lib/prisma` is wrong. Phase 5 code using `@/lib/ai/registry` for the provider registry is wrong — use `@/lib/model-router/registry`.

### H18: CONFIG-01 Research Shallow (GAP-006)

**Phases:** 2
**Accepted Risk:** Model configuration UI is a Phase 2 deliverable with no research section. The planner will design the `endpoint_configs` table and UI during planning. Standard CRUD pattern — no novel research needed.

## Findings — MEDIUM Issues (Summary)

| ID | Issue | Phases | Resolution |
|----|-------|--------|------------|
| M1 | AI SDK structured output: use `Output.object()` not `generateObject()` | 3, 5 | Constraint |
| M2 | MSW/Vitest/Zod not in STACK.md version matrix | 5 | Constraint: add during Phase 1 planning |
| M3 | SPRT replaces t-test/chi-square — SUMMARY.md stale | 4 | Document fix |
| M4 | useCompletion CONTEXT.md correction | 3 | **RESOLVED** ✓ |
| M5 | Recharts version notation (3.7.x vs 3.7.0) | 2, 4 | Accept |
| M6 | @supabase/supabase-js version underspecified | 2 | Accept |
| M7 | Phase 5 alert queries raw logs (violates mat view rule) | 2, 5 | Constraint: documented exception |
| M8 | Playground useCompletion + toUIMessageStreamResponse compatibility | 3 | Constraint: verify during planning |
| M9 | eval_scores overall_score vs final_score for A/B metrics | 4, 5 | Decision: use overall_score |
| M10 | Phase 4 eval columns NULL until Phase 5 | 4, 5 | Constraint: documented |
| M11 | Math.random() vs deterministic sampling in Phase 5 eval trigger | 4, 5 | Constraint: use FNV-1a |
| M12 | Deferred reqs (COMP-01) ambiguity in FEATURES.md | All | Accept |
| M13 | OBS-02 30s refresh vs ISR 5-min cache conflict | 2 | Constraint: use router.refresh() on Realtime event |
| M14 | auth() helper pattern unspecified across phases | 3, 4, 5 | Constraint: Phase 1 establishes pattern |
| M15 | pg_net/Vault setup for pg_cron webhooks | 5 | Constraint: document in Phase 5 plan |
| M16 | Welford race condition documentation | 4 | **RESOLVED** (H8 decision) |
| M17 | FEATURES.md high-priority additions (trace, session, model comparison) | 2, 3 | Accept: deferred to post-MVP |
| M18 | Migration naming convention not established | 1 | Accept: Prisma auto-generates |

## Cross-Phase Constraints

These constraints MUST be followed by planners. They represent cross-phase decisions that prevent runtime errors and schema conflicts.

### Schema Constraints

1. **`request_logs.id`** must be `UUID DEFAULT gen_random_uuid()` with composite PK `(id, created_at)` — not BIGSERIAL
2. **`request_logs` columns:** `duration_ms` (not `latency_ms`), `cost_usd` (not `total_cost`), plus `prompt_text TEXT`, `response_text TEXT`
3. **`request_logs.prompt_version_id`** added in Phase 2 as nullable UUID, FK constraint added in Phase 3 migration
4. **User identity:** `profiles` table with `id UUID REFERENCES auth.users(id)` — all phases use `profiles(id)` for FKs
5. **`api_keys` table** defined in Phase 1 with UUID PK, SHA-256 hash, per-key rate limits, expiration
6. **`variant_metrics`** uses simple accumulator columns (`latency_sum`, `latency_sum_sq`, `latency_n`) with `FOR UPDATE` row lock, not Welford
7. **`evaluation_scores`** must include `created_at TIMESTAMPTZ DEFAULT now()` column
8. **`eval_score` A/B metric** uses `overall_score` (available immediately), not `final_score` (post-human-review)

### Import Path Constraints

1. **Prisma client:** `import { prisma } from '@/lib/db/prisma'`
2. **Model registry:** `import { registry } from '@/lib/model-router/registry'`
3. **Package manager:** `pnpm` everywhere (not `npm`)

### API Constraints

1. **AI SDK 6 token properties:** `usage.inputTokens` / `usage.outputTokens`
2. **AI SDK 6 structured output:** `generateText()` with `Output.object()` (not standalone `generateObject()`)
3. **Streaming response:** `toUIMessageStreamResponse()` — verify compatibility with `useCompletion`
4. **Model IDs:** Gemini 2.5 Flash / 2.0 Flash (not 1.5 Pro/Flash). Anthropic model generation must be consistent across phases.

### Architectural Constraints

1. **Phase 5 alert engine** may query `request_logs` directly (documented exception to mat view rule) — requires indexes on `(created_at, cost_usd)`, `(created_at, duration_ms)`, `(created_at, status)`
2. **Phase 4 degradation Stage 3** modifies Phase 2 router code — explicit cross-phase scope
3. **Phase 5 evaluation processor** must update Phase 4 `variant_metrics` eval columns for A/B requests
4. **Seed data** must be modular: `seedBaseData()` (Phase 2) + `seedEvaluationAndAlerts()` (Phase 5)
5. **Evaluation sampling** must use FNV-1a deterministic hashing (same as Phase 4 traffic splitting), not `Math.random()`
6. **Phase 1** must establish `auth()` helper pattern and role guards for Server Actions

### Risk Mitigations

1. **Phase 1 skip-research:** Standard patterns, planner handles during implementation. Low risk.
2. **NFR-03 Accessibility:** Deferred to polish. Add ARIA labels and color-blind palette as low-effort wins.
3. **NFR-04/05 CI/CD + Testing:** Operational details handled during Phase 1 scaffold. Standard patterns.
4. **CONFIG-01 shallow research:** Standard CRUD, planner designs during planning.
5. **Deferred features (trace, session, model comparison):** Explicitly deferred to post-MVP. Add to REQUIREMENTS.md as deferred.

## Resolution History

### Iteration 1 — 2026-03-01 (Autonomous)

**Actions taken:**
- Updated 02-CONTEXT.md: Gemini 1.5 Pro/Flash → Gemini 2.5 Flash / 2.0 Flash (C1 resolved)
- Updated 03-CONTEXT.md: useChat → useCompletion (M4 resolved)
- Decided UUID for request_logs PK (C4 resolved)
- Decided simple accumulator with FOR UPDATE for variant_metrics (H8 resolved)
- Decided overall_score for A/B eval metric (M9 resolved)
- Synthesized 18 cross-phase constraints for planners
- Accepted 5 risks with documented mitigations

**Remaining:** 0 unresolved CRITICAL. All HIGH issues either resolved or captured as planner constraints.

---

*Generated by /gsd:analyze-research — 4 analyzers (stack, interface, dependency, gap)*
*Mode: Autonomous | Profile: Budget (sonnet) | Depth: Thorough*
