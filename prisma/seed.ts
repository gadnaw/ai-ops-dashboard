import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { seedEvaluations } from "../src/db/seed/evaluations";
import { seedAlerts } from "../src/db/seed/alerts";

// Prisma 7: Driver adapter is mandatory. Use DIRECT_URL (port 5432, no pgbouncer).
// pgbouncer (DATABASE_URL) is incompatible with transaction-mode batch operations.
const pool = new Pool({ connectionString: process.env.DIRECT_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// =============================================================================
// MODEL DISTRIBUTION
// Target: 60% OpenAI, 25% Anthropic, 15% Google (locked spec)
// Updated Google model IDs: gemini-2.5-flash + gemini-2.0-flash (1.5 discontinued Sept 2025)
// =============================================================================

const MODELS = [
  // OpenAI — 60% total
  { id: "openai:gpt-4o", provider: "openai", weight: 0.3 },
  { id: "openai:gpt-4o-mini", provider: "openai", weight: 0.3 },
  // Anthropic — 25% total
  { id: "anthropic:claude-3-5-sonnet-20241022", provider: "anthropic", weight: 0.15 },
  { id: "anthropic:claude-3-5-haiku-20241022", provider: "anthropic", weight: 0.1 },
  // Google — 15% total (updated model IDs)
  { id: "google:gemini-2.5-flash", provider: "google", weight: 0.1 },
  { id: "google:gemini-2.0-flash", provider: "google", weight: 0.05 },
] as const;

type ModelEntry = (typeof MODELS)[number];

// 3 named endpoints — distribution across request_logs
const ENDPOINTS = ["summarization", "classification", "extraction"] as const;

// Weighted model selection
function pickModel(): ModelEntry {
  const r = Math.random();
  let cumulative = 0;
  for (const m of MODELS) {
    cumulative += m.weight;
    if (r < cumulative) return m;
  }
  return MODELS[MODELS.length - 1]!;
}

// Business-hours weighted hour selection
// Peak: 9am-5pm weekdays, secondary: early morning / evening, minimal: nights
const HOUR_WEIGHTS = [
  0.2,
  0.1,
  0.1,
  0.1,
  0.1,
  0.2, // 0-5am
  0.5,
  1.0,
  2.0,
  3.0,
  3.5,
  3.5, // 6-11am
  3.0,
  3.5,
  3.5,
  3.0,
  2.5,
  2.0, // 12-5pm
  1.5,
  1.0,
  0.8,
  0.5,
  0.3,
  0.2, // 6-11pm
];
const HOUR_WEIGHTS_TOTAL = HOUR_WEIGHTS.reduce((a, b) => a + b, 0);

function weightedHour(isWeekend: boolean): number {
  // Reduce all weights by 70% on weekends
  const multiplier = isWeekend ? 0.3 : 1.0;
  let r = Math.random() * HOUR_WEIGHTS_TOTAL * multiplier;
  for (let h = 0; h < 24; h++) {
    r -= HOUR_WEIGHTS[h]! * multiplier;
    if (r <= 0) return h;
  }
  return 12;
}

// Log-normal latency approximation by model tier (Box-Muller)
const LATENCY_PARAMS: Record<string, [number, number]> = {
  "openai:gpt-4o": [2000, 800],
  "openai:gpt-4o-mini": [800, 300],
  "anthropic:claude-3-5-sonnet-20241022": [2500, 900],
  "anthropic:claude-3-5-haiku-20241022": [900, 400],
  "google:gemini-2.5-flash": [700, 250],
  "google:gemini-2.0-flash": [750, 280],
};

function sampleLatencyMs(modelId: string): number {
  const [mean, std] = LATENCY_PARAMS[modelId] ?? [1500, 500];
  const u1 = Math.random();
  const u2 = Math.random();
  // Box-Muller transform for normal distribution approximation
  const normal = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return Math.max(100, Math.round(mean! + normal * std!));
}

// =============================================================================
// seedBaseData — Phase 2 base dataset: 10K requests over 30 days
// H11: Modular function — Phase 5 adds seedEvaluationAndAlerts() separately
// =============================================================================

export async function seedBaseData(): Promise<void> {
  const TOTAL = 10_000;
  const DAYS = 30;
  const BATCH_SIZE = 500; // Confirmed safe threshold (Prisma GitHub #26805)

  console.log(`Seeding ${TOTAL} request logs over ${DAYS} days...`);

  // Load rate cards from DB (already seeded in migration)
  const rateCards = await prisma.costRateCard.findMany({ where: { isActive: true } });
  const rateMap = new Map(
    rateCards.map((r) => [
      r.modelId,
      {
        inputPrice: Number(r.inputPricePerMTokens),
        outputPrice: Number(r.outputPricePerMTokens),
      },
    ])
  );

  const now = new Date();
  // Seed data starts 30 days ago (rounded to start of day)
  const seedStart = new Date(now);
  seedStart.setDate(seedStart.getDate() - DAYS);
  seedStart.setHours(0, 0, 0, 0);

  // Pre-generate UUIDs for prompt versions (5 versions across 3 endpoints)
  // These are random UUIDs — Phase 3 will link them to actual prompt_versions rows
  const PROMPT_VERSION_IDS = Array.from({ length: 5 }, () => crypto.randomUUID());

  const records: Array<{
    id: string;
    provider: string;
    model: string;
    endpoint: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costUsd: number;
    durationMs: number | null;
    status: string;
    errorCode: string | null;
    isFallback: boolean;
    fallbackReason: string | null;
    promptVersionId: string;
    createdAt: Date;
  }> = [];

  for (let i = 0; i < TOTAL; i++) {
    // Spread requests evenly across 30 days
    const dayOffset = Math.floor((i / TOTAL) * DAYS);
    const requestDate = new Date(seedStart);
    requestDate.setDate(requestDate.getDate() + dayOffset);

    const isWeekend = requestDate.getDay() === 0 || requestDate.getDay() === 6;
    const hour = weightedHour(isWeekend);
    requestDate.setHours(hour, Math.floor(Math.random() * 60), Math.floor(Math.random() * 60), 0);

    const model = pickModel();
    const endpoint = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)]!;

    // ~1% hard errors, ~3% fallback events (disjoint — fallbacks can succeed)
    const isError = Math.random() < 0.01;
    const isFallback = !isError && Math.random() < 0.03;

    const inputTokens = Math.floor(Math.random() * 2000) + 100;
    const outputTokens = isError ? 0 : Math.floor(Math.random() * 1500) + 50;
    const cachedTokens = Math.random() < 0.15 ? Math.floor(inputTokens * 0.3) : 0; // 15% cache hit rate

    const rates = rateMap.get(model.id);
    const baseCost = rates
      ? ((inputTokens - cachedTokens) * rates.inputPrice +
          cachedTokens * rates.inputPrice * 0.1 + // cached tokens at 10% price
          outputTokens * rates.outputPrice) /
        1_000_000
      : 0;

    // Day-15 cost spike: 3x cost multiplier (simulates incident / traffic burst)
    // dayOffset 14 = the 15th day in 0-indexed terms
    const costMultiplier = dayOffset === 14 ? 3.0 : 1.0;
    const costUsd = Math.round(baseCost * costMultiplier * 1e8) / 1e8;

    // Prompt version ID: distribute across 5 versions
    const promptVersionId = PROMPT_VERSION_IDS[i % 5]!;

    records.push({
      id: crypto.randomUUID(),
      provider: model.provider,
      model: model.id,
      endpoint,
      inputTokens,
      outputTokens,
      cachedTokens,
      costUsd,
      durationMs: isError ? null : sampleLatencyMs(model.id),
      status: isError ? "error" : "success",
      errorCode: isError
        ? (["rate_limit", "timeout", "model_error"] as const)[Math.floor(Math.random() * 3)]!
        : null,
      isFallback,
      fallbackReason: isFallback
        ? `Primary model overloaded (simulated fallback day ${dayOffset + 1})`
        : null,
      promptVersionId,
      createdAt: requestDate,
    });
  }

  // Batch insert — 500 rows per createMany (confirmed safe threshold)
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await prisma.requestLog.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += batch.length;
    console.log(`  Inserted ${inserted} / ${TOTAL}`);
  }

  console.log("Seed complete. Refreshing materialized views...");

  // Plain REFRESH (not CONCURRENTLY) is safe here because this runs at seed time,
  // not during dashboard reads. Dashboard reads happen after seed completes.
  await prisma.$executeRawUnsafe("REFRESH MATERIALIZED VIEW hourly_cost_summary");
  await prisma.$executeRawUnsafe("REFRESH MATERIALIZED VIEW hourly_latency_percentiles");
  await prisma.$executeRawUnsafe("REFRESH MATERIALIZED VIEW daily_model_breakdown");

  console.log("Materialized views refreshed. Seed data is live in dashboard.");
}

// =============================================================================
// seedEvaluationAndAlerts — Phase 5: Evaluation scores + Alert history
// H11: Modular composition — calls seedBaseData() first, then adds Phase 5 data
// =============================================================================

export async function seedEvaluationAndAlerts(): Promise<void> {
  console.log("Phase 5 seed: evaluation scores + alert history");

  console.log("Step 1: Seeding evaluation data...");
  await seedEvaluations(prisma);

  console.log("Step 2: Seeding alert rules and history...");
  await seedAlerts(prisma);

  console.log("Phase 5 seed complete.");
}

// =============================================================================
// Main entry point
// =============================================================================

async function main() {
  console.log("=== AI Ops Dashboard — Seed Script ===");
  console.log("Using DIRECT_URL (port 5432, bypasses pgbouncer)");

  // Clear existing seed data before re-seeding (idempotent)
  console.log("Clearing existing data...");
  // Clear Phase 5 data first (FK references)
  await prisma.$executeRawUnsafe("TRUNCATE alert_history CASCADE");
  await prisma.$executeRawUnsafe("TRUNCATE alert_rules CASCADE");
  await prisma.$executeRawUnsafe("TRUNCATE evaluation_scores CASCADE");
  await prisma.$executeRawUnsafe("TRUNCATE evaluation_jobs CASCADE");
  await prisma.$executeRawUnsafe("TRUNCATE request_logs CASCADE");
  console.log("Cleared.");

  // Phase 2: Base data (10K request_logs + mat view refresh)
  await seedBaseData();

  // Phase 5: Evaluation scores + Alert history (day-15 incident story)
  console.log("");
  await seedEvaluationAndAlerts();

  console.log("");
  console.log("=== Seed Summary ===");
  const requestCount = await prisma.requestLog.count();
  const evalCount = await prisma.evaluationScore.count();
  const ruleCount = await prisma.alertRule.count();
  const historyCount = await prisma.alertHistory.count();
  console.log(`Total request_logs rows: ${requestCount.toLocaleString()}`);
  console.log(`Total evaluation_scores rows: ${evalCount.toLocaleString()}`);
  console.log(`Total alert_rules rows: ${ruleCount}`);
  console.log(`Total alert_history rows: ${historyCount}`);
  console.log("Dashboard is ready. Visit /dashboard to see charts.");
}

main()
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
