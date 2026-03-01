// src/lib/rate-limiter/index.ts
// Single import point for the rate limiter.
// Swap implementation here — API routes never reference PostgresRateLimiter directly.
import { PostgresRateLimiter } from "./postgres-rate-limiter";
import type { RateLimiterInterface } from "./interface";

// Singleton — one instance per Node.js process (across hot reloads in dev)
const globalForRateLimiter = globalThis as unknown as {
  rateLimiter: RateLimiterInterface | undefined;
};

export function getRateLimiter(): RateLimiterInterface {
  if (!globalForRateLimiter.rateLimiter) {
    globalForRateLimiter.rateLimiter = new PostgresRateLimiter();
    // To migrate to Upstash:
    // globalForRateLimiter.rateLimiter = new UpstashRateLimiter(60, 1, 1);
  }
  return globalForRateLimiter.rateLimiter;
}

// Re-export types for convenience
export type { RateLimiterInterface, RateLimitResult, DegradationResult } from "./interface";
export { runDegradationChain } from "./degradation-chain";
export { getCachedResponse, setCachedResponse, hashPrompt } from "./response-cache";
