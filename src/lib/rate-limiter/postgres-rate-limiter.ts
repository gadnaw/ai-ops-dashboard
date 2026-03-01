// src/lib/rate-limiter/postgres-rate-limiter.ts
import { prisma } from "@/lib/db/prisma";
import type { RateLimiterInterface, RateLimitResult } from "./interface";

// Per-key rate limit defaults. Per-key overrides stored in api_keys table.
// These defaults apply when api_keys.rate_limit_rpm is NULL.
const DEFAULT_CAPACITY = 60; // 60 requests/minute burst

const POLL_INTERVAL_MS = 500; // Stage 1 queue poll interval

export class PostgresRateLimiter implements RateLimiterInterface {
  async check(apiKeyId: string): Promise<RateLimitResult> {
    const bucketId = `apikey:${apiKeyId}:rpm`;

    // Look up per-key rate limit overrides (from api_keys.rate_limit_rpm column)
    const apiKey = await prisma.apiKey.findUnique({
      where: { id: apiKeyId },
      select: { rateLimitRpm: true },
    });

    const capacity = apiKey?.rateLimitRpm ?? DEFAULT_CAPACITY;
    const refillRate = capacity / 60.0; // tokens per second = rpm / 60

    // Single atomic DB call via PL/pgSQL function (~10-15ms per call)
    // Returns remaining tokens (>= 0 = allowed, < 0 = rate limited)
    const result = await prisma.$queryRaw<[{ tokens: number }]>`
      SELECT check_rate_limit(
        ${bucketId}::text,
        ${capacity}::integer,
        ${refillRate}::float8
      ) AS tokens
    `;

    const remaining = result[0]?.tokens ?? -1;
    const allowed = remaining >= 0;

    // Retry-After: seconds until 1 token refills
    // When remaining = -1: need 2 tokens / refillRate seconds
    const retryAfterSec = allowed ? 0 : Math.ceil((1 - remaining) / refillRate);

    const resetAtMs = Date.now() + retryAfterSec * 1000;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      retryAfterSec,
      resetAtMs,
      limit: capacity,
      bucketId,
    };
  }

  async blockUntilReady(apiKeyId: string, maxWaitMs: number): Promise<RateLimitResult | null> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const result = await this.check(apiKeyId);
      if (result.allowed) {
        return result;
      }

      // Wait for poll interval, but don't overshoot the deadline
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remainingMs))
      );
    }

    return null; // Timed out — proceed to Stage 2
  }
}
