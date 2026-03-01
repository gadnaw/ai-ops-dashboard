// src/lib/degradation/queries.ts
// Server-only — no "use client" directive. All functions use prisma from @/lib/db/prisma.
import { prisma } from "@/lib/db/prisma";

// Stage colors and labels for consistent use across components
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

/**
 * Fetch recent degradation events from rate_limit_events.
 * Returns individual events ordered by created_at descending.
 * Used by the event list and timeline chart.
 *
 * @param limit - max events to return (default 100)
 * @param windowMinutes - only events within this many minutes (default 60)
 */
export async function getDegradationEvents(
  limit = 100,
  windowMinutes = 60
): Promise<DegradationEvent[]> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const events = await prisma.rateLimitEvent.findMany({
    where: {
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      apiKeyId: true,
      stage: true,
      stageName: true,
      reason: true,
      bucketId: true,
      tokensAtEvent: true,
      queuedMs: true,
      fallbackModel: true,
      cacheHitKey: true,
      retryAfterSec: true,
      createdAt: true,
    },
  });

  return events.map((e) => ({
    ...e,
    tokensAtEvent: e.tokensAtEvent !== null ? Number(e.tokensAtEvent) : null,
  }));
}

/**
 * Group raw degradation events into chains by API key + time proximity.
 * Events within 30 seconds of each other for the same API key are grouped.
 *
 * Returns chains sorted by start time descending (most recent first).
 */
export function groupIntoChains(events: DegradationEvent[]): DegradationChain[] {
  // Sort ascending for grouping
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const chains: DegradationChain[] = [];
  const GROUP_WINDOW_MS = 30_000; // 30 second window

  for (const event of sorted) {
    // Find an existing chain this event belongs to
    const existingChain = chains.find(
      (c) =>
        c.apiKeyId === event.apiKeyId &&
        event.createdAt.getTime() - c.startedAt.getTime() <= GROUP_WINDOW_MS
    );

    if (existingChain) {
      existingChain.stages.push(event);
      if (event.stage > existingChain.maxStage) {
        existingChain.maxStage = event.stage;
      }
      existingChain.totalDurationMs = event.createdAt.getTime() - existingChain.startedAt.getTime();
    } else {
      chains.push({
        apiKeyId: event.apiKeyId,
        startedAt: event.createdAt,
        stages: [event],
        maxStage: event.stage,
        totalDurationMs: 0,
        outcome: stageToOutcome(event.stage),
      });
    }
  }

  // Update outcome based on max stage reached in each chain
  for (const chain of chains) {
    chain.outcome = stageToOutcome(chain.maxStage);
  }

  // Return most recent first
  return chains.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
}

function stageToOutcome(stage: number): "queued" | "fallback" | "cached" | "rejected" {
  if (stage === 1) return "queued";
  if (stage === 2) return "fallback";
  if (stage === 3) return "cached";
  return "rejected";
}

/**
 * Fetch summary statistics for the degradation dashboard header.
 */
export async function getDegradationStats(windowMinutes = 60) {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const [totalEvents, byStage] = await Promise.all([
    prisma.rateLimitEvent.count({
      where: { createdAt: { gte: since } },
    }),
    prisma.rateLimitEvent.groupBy({
      by: ["stage"],
      where: { createdAt: { gte: since } },
      _count: { id: true },
    }),
  ]);

  const stageCounts: Record<number, number> = {};
  for (const row of byStage) {
    stageCounts[row.stage] = row._count.id;
  }

  return {
    totalEvents,
    stageCounts,
    queueEvents: stageCounts[1] ?? 0,
    fallbackEvents: stageCounts[2] ?? 0,
    cacheHits: stageCounts[3] ?? 0,
    rejections: stageCounts[4] ?? 0,
  };
}
