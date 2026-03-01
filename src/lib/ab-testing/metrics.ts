// src/lib/ab-testing/metrics.ts
// Analysis constraint H8: Simple accumulator UPDATE with SELECT ... FOR UPDATE row lock.
// One row per variant in variant_metrics — lock ensures no concurrent overwrites.
import { prisma } from "@/lib/db/prisma";
import { computeSequentialZTest, updateSPRTProportions, initSPRT, checkSPRT } from "./sprt";

export interface VariantStats {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgLatencyMs: number;
  avgCostUsd: number;
  avgEvalScore: number | null;
  sprtLlr: number;
  sprtDecision: string | null;
}

/**
 * Compute variant stats from accumulator columns.
 * Called at READ time (not stored as computed columns — avoids race conditions).
 */
export function computeVariantStats(metrics: {
  requestCount: number;
  errorCount: number;
  latencyN: number;
  latencySum: number;
  latencySumSq: number;
  costN: number;
  costSum: number;
  evalN: number | null;
  evalScoreSum: number | null;
  sprtLlr: number;
  sprtDecision: string | null;
}): VariantStats {
  const errorRate = metrics.requestCount > 0 ? metrics.errorCount / metrics.requestCount : 0;
  const avgLatencyMs = metrics.latencyN > 0 ? metrics.latencySum / metrics.latencyN : 0;
  const avgCostUsd = metrics.costN > 0 ? metrics.costSum / metrics.costN : 0;
  const avgEvalScore =
    metrics.evalN && metrics.evalN > 0 && metrics.evalScoreSum !== null
      ? metrics.evalScoreSum / metrics.evalN
      : null;

  return {
    requestCount: metrics.requestCount,
    errorCount: metrics.errorCount,
    errorRate,
    avgLatencyMs,
    avgCostUsd,
    avgEvalScore,
    sprtLlr: metrics.sprtLlr,
    sprtDecision: metrics.sprtDecision,
  };
}

/**
 * Atomically update per-variant running statistics.
 *
 * Analysis constraint H8: Uses SELECT ... FOR UPDATE row lock to serialize concurrent
 * updates to the same variant row. ~15ms overhead per call (acceptable budget).
 *
 * The UPDATE is intentionally split into:
 * 1. SELECT ... FOR UPDATE (acquire row lock)
 * 2. Run SPRT check on current state + new observation
 * 3. UPDATE with new accumulator values + SPRT state
 *
 * This pattern ensures SPRT state is consistent with the accumulated metrics.
 */
export async function recordVariantObservation(
  variantId: string,
  experimentId: string,
  latencyMs: number,
  costUsd: number,
  isError: boolean,
  opts: {
    primaryMetric: string;
    mde: number;
    minSamples: number;
    controlErrorRate?: number; // for proportion SPRT — current control arm rate
  }
): Promise<{ sprtDecision: string; shouldAutoStop: boolean }> {
  // Atomic accumulator UPDATE + SPRT check in a transaction
  return await prisma.$transaction(async (tx) => {
    // Lock the row for this variant to prevent concurrent partial updates
    const current = await tx.$queryRaw<
      [
        {
          request_count: number;
          error_count: number;
          latency_n: number;
          latency_sum: number;
          latency_sum_sq: number;
          cost_n: number;
          cost_sum: number;
          sprt_llr: number;
        },
      ]
    >`
      SELECT request_count, error_count, latency_n, latency_sum, latency_sum_sq,
             cost_n, cost_sum, sprt_llr
      FROM variant_metrics
      WHERE variant_id = ${variantId}::uuid
      FOR UPDATE
    `;

    const row = current[0];

    // If no row exists yet, upsert it
    if (!row) {
      await tx.variantMetric.create({
        data: {
          variantId,
          experimentId,
          requestCount: 1,
          errorCount: isError ? 1 : 0,
          latencyN: 1,
          latencySum: latencyMs,
          latencySumSq: latencyMs * latencyMs,
          costN: 1,
          costSum: costUsd,
          sprtLlr: 0,
          sprtDecision: "continue",
        },
      });
      return { sprtDecision: "continue", shouldAutoStop: false };
    }

    // Compute new accumulator values
    const newRequestCount = row.request_count + 1;
    const newErrorCount = row.error_count + (isError ? 1 : 0);
    const newLatencyN = row.latency_n + 1;
    const newLatencySum = row.latency_sum + latencyMs;
    const newLatencySumSq = row.latency_sum_sq + latencyMs * latencyMs;
    const newCostN = row.cost_n + 1;
    const newCostSum = row.cost_sum + costUsd;

    // Compute new SPRT state based on primary metric
    let newSprtLlr = row.sprt_llr;
    let sprtDecision: string = "continue";

    if (opts.primaryMetric === "error_rate" && opts.controlErrorRate !== undefined) {
      // Proportion SPRT for error rate
      const currentState = initSPRT(0.05, 0.2);
      currentState.llr = row.sprt_llr;
      currentState.n = row.request_count;

      const newState = updateSPRTProportions(
        currentState,
        isError ? 1 : 0,
        opts.controlErrorRate,
        opts.mde
      );
      newSprtLlr = newState.llr;
      sprtDecision = checkSPRT(newState, opts.minSamples);
    } else if (opts.primaryMetric === "avg_latency_ms" || opts.primaryMetric === "avg_cost_usd") {
      // Sequential z-test for continuous metrics
      // Note: for the SPRT check, we approximate using updated sums
      // A full z-test requires control arm stats — these are fetched in experiment-runner
      // For now, store updated LLR from running accumulation
      // (experiment-runner computes cross-variant SPRT)
      newSprtLlr = row.sprt_llr; // Updated by experiment-runner after both variants checked
      sprtDecision = "continue";
    }

    const shouldAutoStop = sprtDecision === "accept_h1" || sprtDecision === "accept_h0";

    // Atomic update with new accumulator values and SPRT state
    await tx.$executeRaw`
      UPDATE variant_metrics
      SET
        request_count  = ${newRequestCount},
        error_count    = ${newErrorCount},
        latency_n      = ${newLatencyN},
        latency_sum    = ${newLatencySum},
        latency_sum_sq = ${newLatencySumSq},
        cost_n         = ${newCostN},
        cost_sum       = ${newCostSum},
        sprt_llr       = ${newSprtLlr},
        sprt_decision  = ${sprtDecision},
        sprt_checked_at = now(),
        updated_at     = now()
      WHERE variant_id = ${variantId}::uuid
    `;

    return { sprtDecision, shouldAutoStop };
  });
}

// Re-export computeSequentialZTest for use in experiment-runner
export { computeSequentialZTest };
