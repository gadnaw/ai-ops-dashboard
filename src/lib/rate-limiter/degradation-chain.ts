// src/lib/rate-limiter/degradation-chain.ts
import { prisma } from "@/lib/db/prisma";
import { getCachedResponse, hashPrompt } from "./response-cache";
import type { RateLimiterInterface, DegradationResult } from "./interface";

// Stage 2: hardcoded fallback model map (cheaper/faster alternatives)
// These align with the Phase 2 model registry and cost_rate_cards.
// Analysis constraint H1: Use consistent Anthropic model IDs across phases.
const FALLBACK_MODEL_MAP: Record<string, string> = {
  "openai:gpt-4o": "openai:gpt-4o-mini",
  "openai:gpt-4o-mini": "google:gemini-2.0-flash",
  "anthropic:claude-3-5-sonnet-20241022": "anthropic:claude-3-5-haiku-20241022",
  "anthropic:claude-3-5-haiku-20241022": "google:gemini-2.0-flash",
  "google:gemini-2.5-flash": "google:gemini-2.0-flash",
  "google:gemini-2.0-flash": "openai:gpt-4o-mini",
};

function getFallbackModel(primaryModel: string): string | null {
  return FALLBACK_MODEL_MAP[primaryModel] ?? null;
}

interface LogEventInput {
  apiKeyId: string;
  requestLogId?: string;
  stage: 1 | 2 | 3 | 4;
  stageName: string;
  reason: string;
  bucketId: string;
  tokensAtEvent?: number;
  queuedMs?: number;
  fallbackModel?: string;
  cacheHitKey?: string;
  retryAfterSec?: number;
}

async function logDegradationEvent(input: LogEventInput): Promise<void> {
  try {
    await prisma.rateLimitEvent.create({
      data: {
        apiKeyId: input.apiKeyId,
        requestLogId: input.requestLogId ?? null,
        stage: input.stage,
        stageName: input.stageName,
        reason: input.reason,
        bucketId: input.bucketId,
        tokensAtEvent: input.tokensAtEvent ?? null,
        queuedMs: input.queuedMs ?? null,
        fallbackModel: input.fallbackModel ?? null,
        cacheHitKey: input.cacheHitKey ?? null,
        retryAfterSec: input.retryAfterSec ?? null,
      },
    });
  } catch (err) {
    // Log failures must not propagate — degrade gracefully even in logging
    console.error("[degradation-chain] event log failed:", err);
  }
}

/**
 * Four-stage graceful degradation chain.
 *
 * Stage 1: Queue — poll rate limiter for up to 10s
 * Stage 2: Fallback model — try cheaper alternative model
 * Stage 3: Cached response — serve from response_cache if available
 * Stage 4: Reject — 429 with Retry-After header
 *
 * Called from /api/v1/chat BEFORE routing to the LLM.
 * Normal (non-rate-limited) requests bypass all stages.
 */
export async function runDegradationChain(
  apiKeyId: string,
  prompt: string,
  requestedModel: string,
  rateLimiter: RateLimiterInterface
): Promise<DegradationResult> {
  const bucketId = `apikey:${apiKeyId}:rpm`;

  // Check rate limit — if allowed, bypass degradation entirely
  const initialCheck = await rateLimiter.check(apiKeyId);
  if (initialCheck.allowed) {
    return {
      action: "proceed",
      model: requestedModel,
      isFallback: false,
      stagesTraversed: [],
    };
  }

  const stagesTraversed: number[] = [];

  // ─────────────────────────────────────────────────────────
  // STAGE 1: Request Queue — poll for up to 10 seconds
  // ─────────────────────────────────────────────────────────
  const queueStartMs = Date.now();
  const queueResult = await rateLimiter.blockUntilReady(apiKeyId, 10_000);
  const queuedMs = Date.now() - queueStartMs;
  stagesTraversed.push(1);

  if (queueResult?.allowed) {
    await logDegradationEvent({
      apiKeyId,
      stage: 1,
      stageName: "queued",
      reason: "queued_successfully",
      bucketId,
      tokensAtEvent: queueResult.remaining,
      queuedMs,
    });
    return {
      action: "proceed",
      model: requestedModel,
      isFallback: false,
      stagesTraversed,
    };
  }

  await logDegradationEvent({
    apiKeyId,
    stage: 1,
    stageName: "queue_timeout",
    reason: "queue_wait_exceeded_10s",
    bucketId,
    queuedMs,
  });

  // ─────────────────────────────────────────────────────────
  // STAGE 2: Fallback Model — try cheaper/faster alternative
  // ─────────────────────────────────────────────────────────
  stagesTraversed.push(2);
  const fallbackModel = getFallbackModel(requestedModel);

  if (fallbackModel) {
    // The fallback model may have its own bucket — check it
    // For simplicity, we use the same API key bucket but with the fallback model
    // A production system would have separate per-model buckets
    const fallbackCheck = await rateLimiter.check(apiKeyId);
    if (fallbackCheck.allowed) {
      await logDegradationEvent({
        apiKeyId,
        stage: 2,
        stageName: "fallback_model",
        reason: "primary_rate_limited_fallback_available",
        bucketId,
        tokensAtEvent: fallbackCheck.remaining,
        fallbackModel,
      });
      return {
        action: "proceed",
        model: fallbackModel,
        isFallback: true,
        stagesTraversed,
      };
    }
  }

  await logDegradationEvent({
    apiKeyId,
    stage: 2,
    stageName: "fallback_exhausted",
    reason: fallbackModel ? "fallback_model_also_rate_limited" : "no_fallback_model_configured",
    bucketId,
  });

  // ─────────────────────────────────────────────────────────
  // STAGE 3: Cached Response — serve from response_cache
  // ─────────────────────────────────────────────────────────
  stagesTraversed.push(3);
  const promptHash = hashPrompt(prompt);
  const cached = await getCachedResponse(promptHash, requestedModel);

  if (cached) {
    await logDegradationEvent({
      apiKeyId,
      stage: 3,
      stageName: "cached_response",
      reason: "serving_from_response_cache",
      bucketId,
      cacheHitKey: promptHash,
    });
    return {
      action: "cached",
      cachedResponse: cached.responseText,
      stagesTraversed,
    };
  }

  await logDegradationEvent({
    apiKeyId,
    stage: 3,
    stageName: "cache_miss",
    reason: "no_cached_response_for_prompt",
    bucketId,
  });

  // ─────────────────────────────────────────────────────────
  // STAGE 4: Reject with 429 + Retry-After
  // ─────────────────────────────────────────────────────────
  stagesTraversed.push(4);
  const retryAfterSec = initialCheck.retryAfterSec || 60;

  await logDegradationEvent({
    apiKeyId,
    stage: 4,
    stageName: "rejected_429",
    reason: "all_degradation_stages_exhausted",
    bucketId,
    retryAfterSec,
  });

  return {
    action: "reject",
    retryAfterSec,
    stagesTraversed,
  };
}
