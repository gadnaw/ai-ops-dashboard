// src/lib/rate-limiter/response-cache.ts
import { createHash } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Normalize prompt text for consistent hashing.
 * Lowercase + trim + collapse whitespace.
 */
function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Compute SHA-256 hash of normalized prompt text.
 * Used as cache key for exact-match lookups.
 */
export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(normalizePrompt(prompt)).digest("hex");
}

export interface CachedResponse {
  responseText: string;
  model: string;
  promptHash: string;
  cachedAt: Date;
}

/**
 * Look up a cached response by prompt hash + model.
 * Returns null if no cached entry or entry is expired.
 * Updates hit_count and last_used_at on cache hit.
 */
export async function getCachedResponse(
  promptHash: string,
  model: string
): Promise<CachedResponse | null> {
  const entry = await prisma.responseCache.findUnique({
    where: { promptHash_model: { promptHash, model } },
    select: {
      responseText: true,
      model: true,
      promptHash: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  if (!entry) return null;

  // Check TTL expiry
  if (entry.expiresAt && entry.expiresAt < new Date()) {
    // Expired — delete async, return null
    void prisma.responseCache.delete({
      where: { promptHash_model: { promptHash, model } },
    });
    return null;
  }

  // Update hit stats (non-blocking — fire and forget)
  void prisma.responseCache.update({
    where: { promptHash_model: { promptHash, model } },
    data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
  });

  return {
    responseText: entry.responseText,
    model: entry.model,
    promptHash: entry.promptHash,
    cachedAt: entry.createdAt,
  };
}

/**
 * Store a successful LLM response in the cache.
 * Called from after() in /api/v1/chat on successful completion.
 * TTL default: 24 hours. Upserts on conflict.
 *
 * H10: This function populates the response_cache table introduced in Phase 4.
 * It is called from the Phase 2 /api/v1/chat route (cross-phase modification).
 */
export async function setCachedResponse(
  prompt: string,
  model: string,
  responseText: string,
  opts: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    ttlHours?: number;
  } = {}
): Promise<void> {
  const promptHash = hashPrompt(prompt);
  const expiresAt = new Date(Date.now() + (opts.ttlHours ?? 24) * 60 * 60 * 1000);

  await prisma.responseCache.upsert({
    where: { promptHash_model: { promptHash, model } },
    create: {
      promptHash,
      model,
      responseText,
      ...(opts.inputTokens !== undefined ? { inputTokens: opts.inputTokens } : {}),
      ...(opts.outputTokens !== undefined ? { outputTokens: opts.outputTokens } : {}),
      ...(opts.costUsd !== undefined ? { costUsd: opts.costUsd } : {}),
      expiresAt,
    },
    update: {
      responseText, // Update with fresher response on repeat prompt
      lastUsedAt: new Date(),
      expiresAt,
    },
  });
}
