// src/lib/ab-testing/sprt.ts
// SPRT (Sequential Probability Ratio Test) engine.
// Reference: Wald (1945). Confirmed via UCB Statistics course notes.
// Do NOT replace with repeated t-tests — peeking bias inflates Type I error from 5% to ~30%.

export type SPRTDecision = "accept_h1" | "accept_h0" | "continue";

export interface SPRTState {
  llr: number; // cumulative log-likelihood ratio (running sum)
  upperBoundary: number; // ≈ 2.773 for alpha=0.05
  lowerBoundary: number; // ≈ -1.558 for beta=0.20
  n: number; // total observations processed
}

/**
 * Initialize SPRT state with Wald boundaries.
 * Default: alpha=0.05 (95% confidence), beta=0.20 (80% power)
 *
 * Boundaries:
 *   upper = ln((1-beta)/alpha) ≈ ln(16) ≈ 2.773
 *   lower = ln(beta/(1-alpha)) ≈ ln(0.2105) ≈ -1.558
 */
export function initSPRT(alpha = 0.05, beta = 0.2): SPRTState {
  return {
    llr: 0,
    upperBoundary: Math.log((1 - beta) / alpha), // ≈ 2.773
    lowerBoundary: Math.log(beta / (1 - alpha)), // ≈ -1.558
    n: 0,
  };
}

/**
 * Update SPRT state with a new proportion observation from variant B.
 *
 * For error rate comparison: observation = 1 if error, 0 if success.
 * p0 = null hypothesis rate (control arm's running proportion)
 * delta = minimum detectable effect (e.g., 0.02 = 2 percentage points)
 *
 * IMPORTANT: p0 must be the CURRENT control arm error rate (computed from accumulator),
 * not a pre-specified constant. Update p0 on each call.
 */
export function updateSPRTProportions(
  state: SPRTState,
  observation: 0 | 1, // 1 = event occurred (error), 0 = no event
  p0: number, // current control arm rate estimate
  delta: number // minimum detectable effect
): SPRTState {
  // Alternative hypothesis rate (cap at 0.9999 to avoid ln(0))
  const p1 = Math.min(Math.max(p0 + delta, 0.0001), 0.9999);
  // Ensure p0 is in valid range
  const p0safe = Math.min(Math.max(p0, 0.0001), 0.9999);

  const logRatio = observation === 1 ? Math.log(p1 / p0safe) : Math.log((1 - p1) / (1 - p0safe));

  return {
    ...state,
    llr: state.llr + logRatio,
    n: state.n + 1,
  };
}

/**
 * Sequential z-test for continuous metrics (latency, cost).
 * Statsig-style: approximates SPRT likelihood ratio using normal distribution.
 * Valid by CLT once n >= ~30 per variant.
 *
 * Uses the accumulator columns from variant_metrics:
 *   mean = sum / n
 *   variance = (sum_sq - n * mean^2) / (n - 1)
 *
 * Analysis constraint H8: We store sum/sum_sq/n (not Welford's mean/M2) because
 * concurrent SQL increments of sum/sum_sq are safe without row locks.
 * The variance formula has catastrophic cancellation risk for large n, but for
 * practical LLM latency ranges (50-5000ms) with n <= 5000, precision is sufficient.
 */
export function computeSequentialZTest(
  controlN: number,
  controlSum: number,
  controlSumSq: number,
  treatmentN: number,
  treatmentSum: number,
  treatmentSumSq: number,
  mde: number, // minimum detectable effect in metric units (e.g., 100ms)
  alpha = 0.05,
  beta = 0.2
): { llr: number; decision: SPRTDecision; zScore: number } {
  const upperBoundary = Math.log((1 - beta) / alpha);
  const lowerBoundary = Math.log(beta / (1 - alpha));

  if (controlN < 2 || treatmentN < 2) {
    return { llr: 0, decision: "continue", zScore: 0 };
  }

  const meanA = controlSum / controlN;
  const meanB = treatmentSum / treatmentN;

  // Sample variance from accumulator (may have catastrophic cancellation for large n;
  // acceptable for demo scale of n <= 5000)
  const varA = Math.max(0, (controlSumSq - controlN * meanA * meanA) / (controlN - 1));
  const varB = Math.max(0, (treatmentSumSq - treatmentN * meanB * meanB) / (treatmentN - 1));

  const se = Math.sqrt(varA / controlN + varB / treatmentN);
  if (se === 0) return { llr: 0, decision: "continue", zScore: 0 };

  const zScore = (meanB - meanA) / se;

  // Pooled variance for effect size parameter
  const varPooled = (varA + varB) / 2;
  const denominator = Math.sqrt(varPooled * (1 / controlN + 1 / treatmentN));
  if (denominator === 0) return { llr: 0, decision: "continue", zScore: 0 };

  const phi = mde / denominator;

  // Log-likelihood ratio approximation
  const llr = Math.abs(zScore * phi) - 0.5 * phi * phi;

  let decision: SPRTDecision = "continue";
  if (llr >= upperBoundary) decision = "accept_h1";
  else if (llr <= lowerBoundary) decision = "accept_h0";

  return { llr, decision, zScore };
}

/**
 * Check SPRT decision with minimum sample guard.
 * Always returns 'continue' before minSamples threshold.
 */
export function checkSPRT(state: SPRTState, minSamples: number): SPRTDecision {
  if (state.n < minSamples) return "continue";
  if (state.llr >= state.upperBoundary) return "accept_h1";
  if (state.llr <= state.lowerBoundary) return "accept_h0";
  return "continue";
}

/**
 * Compute effect size (absolute difference for proportions) for display.
 * Positive = treatment is better (lower error rate); negative = treatment is worse.
 */
export function computeEffectSize(controlErrorRate: number, treatmentErrorRate: number): number {
  return controlErrorRate - treatmentErrorRate; // absolute difference
}

/**
 * Compute 95% confidence interval for a proportion estimate.
 * Wilson score interval — more accurate than normal approximation for small n.
 */
export function proportionCI(
  successes: number,
  n: number,
  _confidence = 0.95
): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 1 };
  const z = 1.96; // 95% confidence (z_{0.975})
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return {
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}
