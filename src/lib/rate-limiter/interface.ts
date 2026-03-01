// src/lib/rate-limiter/interface.ts
// No "use client" — server-only module (src/lib/).

export interface RateLimitResult {
  allowed: boolean;
  remaining: number; // tokens remaining after this request (0 if denied)
  retryAfterSec: number; // seconds until 1 token available (0 if allowed)
  resetAtMs: number; // epoch ms when bucket will be at capacity
  limit: number; // bucket capacity
  bucketId: string;
}

/**
 * Swappable rate limiter abstraction.
 * Phase 4: PostgresRateLimiter (default)
 * Future: UpstashRateLimiter (swap in src/lib/rate-limiter/index.ts)
 *
 * Analysis constraint H2: Do NOT install @upstash/ratelimit or @upstash/redis.
 * Upstash is documented upgrade path only.
 */
export interface RateLimiterInterface {
  /** Check and consume 1 request token for the given API key. */
  check(apiKeyId: string): Promise<RateLimitResult>;

  /**
   * Poll until a token is available, or return null after maxWaitMs.
   * Used by Stage 1 (queue) of the degradation chain.
   */
  blockUntilReady(apiKeyId: string, maxWaitMs: number): Promise<RateLimitResult | null>;
}

// Degradation result from runDegradationChain()
export type DegradationAction = "proceed" | "cached" | "reject";

export interface DegradationResult {
  action: DegradationAction;
  model?: string; // for 'proceed': which model to use (may be fallback)
  isFallback?: boolean; // true if Stage 2 was used
  cachedResponse?: string; // for 'cached': the response text to return
  retryAfterSec?: number; // for 'reject': Retry-After header value
  stagesTraversed: number[]; // e.g., [1, 2] means queued then fallback used
}
