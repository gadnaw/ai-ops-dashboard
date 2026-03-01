import { prisma } from "@/lib/db/prisma";

/**
 * FNV-1a 32-bit hash. Deterministic: same requestId always produces same hash.
 * Used for evaluation sampling so the same request is always evaluated or always skipped.
 * Consistent with Phase 4 FNV-1a traffic splitting (src/lib/ab-testing/hash.ts).
 * Analysis constraint M11: Use FNV-1a (not Math.random()) for deterministic sampling.
 */
function fnv1a32(input: string): number {
  let hash = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // FNV prime: 16777619, using Math.imul for 32-bit integer multiplication
    hash = Math.imul(hash, 16777619);
  }
  // Convert to unsigned 32-bit integer
  return hash >>> 0;
}

/**
 * Returns true if this requestId should be sampled for evaluation.
 * At samplingRate=0.1: ~10% of requests are evaluated.
 * Deterministic: same requestId always returns same boolean.
 */
function shouldEvaluate(requestId: string, samplingRate: number): boolean {
  const hash = fnv1a32(requestId);
  // Normalize to [0, 1) by dividing by max uint32 value and compare to sampling rate
  return hash / 0xffffffff < samplingRate;
}

/**
 * Called from /api/v1/chat after() callback after every successful request.
 * Queues the request for LLM evaluation if it falls in the sampling window.
 * Does nothing if no active rubric exists or request is not sampled.
 *
 * Analysis constraint M11: Uses FNV-1a deterministic hash — same request ID
 * always evaluates or always skips. No random behavior.
 */
export async function maybeQueueEvaluation(
  requestId: string,
  samplingRate: number = 0.1
): Promise<void> {
  if (!shouldEvaluate(requestId, samplingRate)) return;

  // Find the default active rubric (oldest active one if multiple exist)
  const defaultRubric = await prisma.evaluationRubric.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!defaultRubric) return; // No rubric configured — skip silently

  await prisma.evaluationJob.create({
    data: {
      requestId,
      rubricId: defaultRubric.id,
      status: "pending",
    },
  });
}
