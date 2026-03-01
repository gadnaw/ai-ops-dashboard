// src/lib/ab-testing/hash.ts
// No "use client" — server-only module.

/**
 * FNV-1a 32-bit hash — deterministic, no external dependencies.
 * Used for A/B traffic splitting and eval sampling (analysis constraint M11).
 * Returns a number in [0, 2^32).
 *
 * Properties:
 * - Non-cryptographic (5ns per hash, faster than crypto.createHash)
 * - Uniform distribution for short strings (requestId + experimentId)
 * - Deterministic: same input always returns same output
 * - Compatible with Edge Runtime (no Node.js crypto module needed)
 */
export function fnv1a32(str: string): number {
  let hash = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime (32-bit): 16777619
    // Math.imul() performs C-like 32-bit integer multiplication
    // >>> 0 converts to unsigned 32-bit integer
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Assign a request to an experiment variant deterministically.
 *
 * @param requestId - Unique request identifier (e.g., crypto.randomUUID())
 * @param experimentId - Unique experiment identifier (UUID)
 * @param splits - Array of split ratios summing to 1.0 (e.g., [0.7, 0.3])
 * @returns Variant index (0-based): 0 = control, 1 = treatment
 *
 * Consistency guarantee: Same requestId + experimentId always returns the same index.
 * Distribution: For n=1000, deviates from target by <±3% (success criteria 3).
 */
export function assignVariant(requestId: string, experimentId: string, splits: number[]): number {
  const seed = `${requestId}:${experimentId}`;
  const hash = fnv1a32(seed);

  // Normalize to [0, 1)
  const normalized = hash / 0x100000000; // divide by 2^32

  // Bucket assignment: walk cumulative distribution
  let cumulative = 0;
  for (let i = 0; i < splits.length; i++) {
    cumulative += splits[i]!;
    if (normalized < cumulative) return i;
  }

  return splits.length - 1; // floating point safety fallback
}

/**
 * Quick distribution check — use in unit tests to verify splits.
 * For n=10000 with [0.7, 0.3] target, expect counts near [7000, 3000] ±300.
 */
export function verifyDistribution(splits: number[], iterations = 10000): number[] {
  const counts = new Array(splits.length).fill(0) as number[];
  for (let i = 0; i < iterations; i++) {
    const requestId = `req_${i}_${Math.random().toString(36).slice(2)}`;
    const variant = assignVariant(requestId, "test-experiment", splits);
    counts[variant] = (counts[variant] ?? 0) + 1;
  }
  return counts.map((c) => c / iterations);
}
