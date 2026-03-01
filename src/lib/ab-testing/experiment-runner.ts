// src/lib/ab-testing/experiment-runner.ts
import { prisma } from "@/lib/db/prisma";
import { assignVariant } from "./hash";
import { recordVariantObservation } from "./metrics";
import { computeSequentialZTest } from "./sprt";

export interface ActiveExperiment {
  id: string;
  name: string;
  primaryMetric: string;
  mde: number;
  minSamples: number;
  maxSamples: number;
  alpha: number;
  beta: number;
  variants: Array<{
    id: string;
    name: string;
    promptVersionId: string | null;
    trafficWeight: number;
    isControl: boolean;
  }>;
}

// Module-level cache for active experiments — refreshed every 30s
// Avoids a DB query per request in the critical path
let experimentCache: Map<string, ActiveExperiment | null> = new Map();
let cacheExpiry = 0;
const CACHE_TTL_MS = 30_000;

async function getExperimentCache(): Promise<Map<string, ActiveExperiment | null>> {
  if (Date.now() < cacheExpiry) return experimentCache;

  // Fetch all running experiments with their variants
  const experiments = await prisma.experiment.findMany({
    where: { status: "running" },
    include: {
      variants: {
        select: {
          id: true,
          name: true,
          promptVersionId: true,
          trafficWeight: true,
          isControl: true,
        },
      },
    },
  });

  experimentCache = new Map();
  for (const exp of experiments) {
    experimentCache.set(exp.id, {
      id: exp.id,
      name: exp.name,
      primaryMetric: exp.primaryMetric,
      mde: exp.mde,
      minSamples: exp.minSamples,
      maxSamples: exp.maxSamples,
      alpha: exp.alpha,
      beta: exp.beta,
      variants: exp.variants,
    });
  }

  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return experimentCache;
}

/**
 * Get the active running experiment for a given prompt version ID.
 * Returns null if no running experiment uses this prompt version.
 */
export async function getActiveExperiment(
  promptVersionId: string
): Promise<ActiveExperiment | null> {
  const cache = await getExperimentCache();

  for (const experiment of cache.values()) {
    if (!experiment) continue;
    const hasVariant = experiment.variants.some((v) => v.promptVersionId === promptVersionId);
    if (hasVariant) return experiment;
  }

  return null;
}

/**
 * Record a request observation for an A/B experiment.
 * Called from /api/v1/chat after() callback for requests that have a prompt version.
 *
 * Steps:
 * 1. Check if the prompt version is part of a running experiment
 * 2. Assign variant deterministically using FNV-1a hash
 * 3. Record metrics in the assigned variant's accumulator
 * 4. Run SPRT check — if boundary crossed, trigger auto-stop
 * 5. If maxSamples reached, mark experiment as inconclusive
 *
 * Analysis constraint M11: Use FNV-1a (not Math.random()).
 * Analysis constraint H8: accumulator UPDATE via metrics.recordVariantObservation().
 */
export async function runExperiment(
  experimentId: string,
  requestId: string,
  latencyMs: number,
  costUsd: number,
  isError: boolean
): Promise<void> {
  const cache = await getExperimentCache();
  const experiment = cache.get(experimentId);
  if (!experiment) return;

  // Assign variant deterministically
  const splits = experiment.variants.map((v) => v.trafficWeight);
  const variantIndex = assignVariant(requestId, experimentId, splits);
  const assignedVariant = experiment.variants[variantIndex];
  if (!assignedVariant) return;

  // Get control variant for SPRT proportion comparison
  const controlVariant = experiment.variants.find((v) => v.isControl);
  let controlErrorRate: number | undefined;

  if (controlVariant && experiment.primaryMetric === "error_rate") {
    const controlMetrics = await prisma.variantMetric.findUnique({
      where: { variantId: controlVariant.id },
      select: { requestCount: true, errorCount: true },
    });
    if (controlMetrics && controlMetrics.requestCount > 0) {
      controlErrorRate = controlMetrics.errorCount / controlMetrics.requestCount;
    }
  }

  // Record the observation (accumulator UPDATE + SPRT check)
  const { sprtDecision, shouldAutoStop } = await recordVariantObservation(
    assignedVariant.id,
    experimentId,
    latencyMs,
    costUsd,
    isError,
    {
      primaryMetric: experiment.primaryMetric,
      mde: experiment.mde,
      minSamples: experiment.minSamples,
      ...(controlErrorRate !== undefined ? { controlErrorRate } : {}),
    }
  );

  // For continuous metrics (latency, cost), run cross-variant z-test
  if (
    experiment.primaryMetric === "avg_latency_ms" ||
    experiment.primaryMetric === "avg_cost_usd"
  ) {
    await runContinuousMetricSPRT(experiment);
  }

  // Auto-stop if SPRT decision reached
  if (shouldAutoStop) {
    await autoStopExperiment(experiment.id, assignedVariant.id, sprtDecision);
  }

  // Check max sample truncation guard
  const totalRequestCount = await prisma.variantMetric.aggregate({
    where: { experimentId },
    _sum: { requestCount: true },
  });

  const totalRequests = totalRequestCount._sum.requestCount ?? 0;
  if (totalRequests >= experiment.maxSamples * experiment.variants.length) {
    await autoStopExperiment(experiment.id, null, "inconclusive");
  }

  // Record SPRT snapshot for trajectory chart every 10 observations
  if (totalRequests % 10 === 0) {
    const treatmentMetrics = await prisma.variantMetric.findFirst({
      where: { experimentId, variant: { isControl: false } },
      select: { sprtLlr: true, requestCount: true },
    });

    if (treatmentMetrics) {
      await prisma.sprtHistory.create({
        data: {
          experimentId,
          sampleCount: totalRequests,
          llr: treatmentMetrics.sprtLlr,
          upperBoundary: Math.log((1 - experiment.beta) / experiment.alpha),
          lowerBoundary: Math.log(experiment.beta / (1 - experiment.alpha)),
        },
      });
    }
  }
}

async function runContinuousMetricSPRT(experiment: ActiveExperiment): Promise<void> {
  // Fetch metrics for all variants
  const allMetrics = await prisma.variantMetric.findMany({
    where: { experimentId: experiment.id },
    select: {
      variantId: true,
      latencyN: true,
      latencySum: true,
      latencySumSq: true,
      costN: true,
      costSum: true,
      variant: { select: { isControl: true } },
    },
  });

  const control = allMetrics.find((m) => m.variant.isControl);
  const treatment = allMetrics.find((m) => !m.variant.isControl);
  if (!control || !treatment) return;

  const useLatency = experiment.primaryMetric === "avg_latency_ms";

  const { llr, decision } = computeSequentialZTest(
    control.latencyN,
    useLatency ? control.latencySum : control.costSum,
    useLatency ? control.latencySumSq : control.costSum * control.costSum, // approximation
    treatment.latencyN,
    useLatency ? treatment.latencySum : treatment.costSum,
    useLatency ? treatment.latencySumSq : treatment.costSum * treatment.costSum,
    experiment.mde,
    experiment.alpha,
    experiment.beta
  );

  // Update treatment variant SPRT state
  if (decision !== "continue") {
    await prisma.variantMetric.update({
      where: { variantId: treatment.variantId },
      data: {
        sprtLlr: llr,
        sprtDecision: decision,
        sprtCheckedAt: new Date(),
      },
    });

    if (decision === "accept_h1" || decision === "accept_h0") {
      await autoStopExperiment(experiment.id, treatment.variantId, decision);
    }
  }
}

async function autoStopExperiment(
  experimentId: string,
  winnerVariantId: string | null,
  decision: string
): Promise<void> {
  // Invalidate cache
  experimentCache.delete(experimentId);
  cacheExpiry = 0;

  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      status: decision === "inconclusive" ? "stopped" : "completed",
      stoppedAt: new Date(),
      ...(decision === "accept_h1" && winnerVariantId
        ? { winnerVariantId }
        : { winnerVariantId: null }),
    },
  });
}
