// src/lib/degradation/constants.ts
// Shared constants for degradation visualization — safe to import in both Server and Client components.
// No prisma imports here — this file is browser-safe.

export const STAGE_CONFIG = {
  1: { name: "Queued", color: "#3b82f6", label: "Stage 1: Queued (waiting for token)" },
  2: { name: "Fallback Model", color: "#f59e0b", label: "Stage 2: Fallback Model" },
  3: { name: "Cached Response", color: "#8b5cf6", label: "Stage 3: Cached Response" },
  4: { name: "Rejected (429)", color: "#ef4444", label: "Stage 4: Rejected 429" },
} as const;

export type StageNumber = keyof typeof STAGE_CONFIG;

// A single degradation event row (one stage transition)
export interface DegradationEvent {
  id: string;
  apiKeyId: string;
  stage: number;
  stageName: string;
  reason: string;
  bucketId: string;
  tokensAtEvent: number | null;
  queuedMs: number | null;
  fallbackModel: string | null;
  cacheHitKey: string | null;
  retryAfterSec: number | null;
  createdAt: Date;
}

// A group of events for the same request (same api_key + within 30 seconds)
// This represents one full degradation chain traversal
export interface DegradationChain {
  apiKeyId: string;
  startedAt: Date;
  stages: DegradationEvent[];
  maxStage: number; // highest stage reached (4 = fully rejected)
  totalDurationMs: number; // span from first to last stage event
  outcome: "queued" | "fallback" | "cached" | "rejected";
}
