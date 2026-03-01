"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { getSession } from "@/lib/auth/session";

/**
 * Approve the judge's scores as-is for an evaluation.
 * Sets human_reviewed=true, records reviewer identity, keeps overall_score as final_score.
 */
export async function approveScore(params: {
  scoreId: string;
  reviewerNotes?: string;
}): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized -- must be logged in to review" };
    }

    // Fetch existing score to copy overall_score as final_score
    const existing = await prisma.evaluationScore.findUnique({
      where: { id: params.scoreId },
      select: { overallScore: true },
    });

    if (!existing) {
      return { error: "Evaluation score not found" };
    }

    await prisma.evaluationScore.update({
      where: { id: params.scoreId },
      data: {
        humanReviewed: true,
        humanReviewerId: session.userId,
        ...(params.reviewerNotes ? { humanReviewNotes: params.reviewerNotes } : {}),
        finalScore: existing.overallScore,
        finalScoredAt: new Date(),
      },
    });

    revalidatePath("/evaluation/review");
    revalidatePath("/evaluation");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to approve score";
    return { error: message };
  }
}

/**
 * Override the judge's dimension scores with human-provided values.
 * Recomputes final_score as weighted average: accuracy 40%, coherence 30%, safety 30%.
 * Only overridden dimensions change; non-overridden dimensions keep the judge's score.
 */
export async function overrideScore(params: {
  scoreId: string;
  dimensionOverrides: Record<string, number>;
  reviewerNotes?: string;
}): Promise<{ success: true } | { error: string }> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return { error: "Unauthorized" };
    }

    if (Object.keys(params.dimensionOverrides).length === 0) {
      return {
        error: "dimensionOverrides cannot be empty -- use approveScore to keep judge scores",
      };
    }

    // Validate all override values are integers in [1, 5]
    for (const [dim, value] of Object.entries(params.dimensionOverrides)) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        return { error: `Invalid score for dimension "${dim}": must be integer 1-5, got ${value}` };
      }
    }

    // Fetch existing judge scores to merge with overrides
    const existing = await prisma.evaluationScore.findUniqueOrThrow({
      where: { id: params.scoreId },
      select: { dimensionScores: true },
    });

    const judgeScores = existing.dimensionScores as Record<string, number>;
    const mergedScores = { ...judgeScores, ...params.dimensionOverrides };

    // Compute weighted final_score: accuracy=40%, coherence=30%, safety=30%
    const WEIGHTS: Record<string, number> = {
      accuracy: 0.4,
      coherence: 0.3,
      safety: 0.3,
    };

    let weightedSum = 0;
    let totalWeight = 0;
    for (const [dim, score] of Object.entries(mergedScores)) {
      const weight = WEIGHTS[dim] ?? 1 / Object.keys(mergedScores).length;
      weightedSum += score * weight;
      totalWeight += weight;
    }

    const newFinalScore =
      totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 10) / 10
        : weightedSum / Object.keys(mergedScores).length;

    await prisma.evaluationScore.update({
      where: { id: params.scoreId },
      data: {
        humanReviewed: true,
        humanReviewerId: session.userId,
        ...(params.reviewerNotes ? { humanReviewNotes: params.reviewerNotes } : {}),
        humanDimensionOverrides: params.dimensionOverrides,
        finalScore: newFinalScore,
        finalScoredAt: new Date(),
      },
    });

    revalidatePath("/evaluation/review");
    revalidatePath("/evaluation");
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to override score";
    return { error: message };
  }
}
