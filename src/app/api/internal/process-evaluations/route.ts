import { prisma } from "@/lib/db/prisma";
import { safeJudgeRequest } from "@/lib/evaluator/judge";
import { buildRubricText } from "@/lib/evaluator/rubric";
import { assignVariant } from "@/lib/ab-testing/hash";

export const runtime = "nodejs"; // after() and prisma require Node.js runtime

/**
 * Validate the x-internal-secret header against INTERNAL_CRON_SECRET.
 * Returns false if secret is missing, wrong, or env var is not set.
 */
function validateSecret(request: Request): boolean {
  const secret = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_CRON_SECRET;
  if (!expected) return false;
  return secret === expected;
}

/**
 * POST /api/internal/process-evaluations
 *
 * Batch processor for pending evaluation jobs. Called by pg_cron every 5 minutes.
 * Picks up to 10 pending jobs using FOR UPDATE SKIP LOCKED to prevent duplicate
 * processing when multiple invocations overlap.
 *
 * HMAC-protected via x-internal-secret header matching INTERNAL_CRON_SECRET.
 *
 * pg_cron setup (run in Supabase SQL Editor):
 * SELECT cron.schedule(
 *   'process-evaluation-jobs',
 *   '* /5 * * * *',
 *   $$SELECT net.http_post(
 *     url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_url')
 *       || '/api/internal/process-evaluations',
 *     headers := jsonb_build_object(
 *       'Content-Type', 'application/json',
 *       'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret')
 *     ),
 *     body := '{}'::jsonb,
 *     timeout_milliseconds := 25000
 *   );$$
 * );
 */
export async function POST(request: Request) {
  if (!validateSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pick up to 10 pending jobs atomically using FOR UPDATE SKIP LOCKED
  // This prevents duplicate processing when multiple invocations overlap
  const jobs = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE evaluation_jobs
    SET status = 'in_progress',
        started_at = now(),
        attempt_count = attempt_count + 1
    WHERE id IN (
      SELECT id FROM evaluation_jobs
      WHERE status = 'pending'
        AND attempt_count < 3
      ORDER BY created_at ASC
      LIMIT 10
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `;

  if (jobs.length === 0) {
    return Response.json({ processed: 0, succeeded: 0, failed: 0 });
  }

  const results = await Promise.allSettled(jobs.map(({ id }) => processEvaluationJob(id)));

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return Response.json({ processed: jobs.length, succeeded, failed });
}

async function processEvaluationJob(jobId: string): Promise<void> {
  // Fetch job with rubric; request is fetched separately via raw query to handle
  // partitioned request_logs (no Prisma relation due to composite PK constraint)
  const job = await prisma.evaluationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      rubric: true, // evaluation_rubrics row — needs dimensions JSONB
    },
  });

  // Fetch request_logs row directly (no Prisma relation — partitioned table)
  const requestLog = await prisma.requestLog.findFirst({
    where: { id: job.requestId },
    select: {
      promptText: true,
      responseText: true,
      promptVersionId: true,
    },
  });

  try {
    // request_logs must have prompt_text and response_text (Phase 2 constraint H5)
    const originalPrompt = requestLog?.promptText ?? "";
    const modelResponse = requestLog?.responseText ?? "";

    if (!originalPrompt || !modelResponse) {
      throw new Error("Request missing prompt_text or response_text — cannot evaluate");
    }

    const score = await safeJudgeRequest({
      rubricId: job.rubricId,
      rubricText: buildRubricText(job.rubric),
      originalPrompt,
      modelResponse,
    });

    if (!score) {
      throw new Error(
        "Judge returned null output (NoObjectGeneratedError) — marking as non-retryable"
      );
    }

    // Determine if human review is needed: any dimension scoring below 3
    const dimensionValues = Object.values(score.scores) as number[];
    const requiresReview = dimensionValues.some((s) => s < 3);

    await prisma.$transaction(async (tx) => {
      await tx.evaluationScore.create({
        data: {
          requestId: job.requestId,
          rubricId: job.rubricId,
          jobId: job.id,
          judgeModel: "gpt-4o",
          dimensionScores: score.scores,
          overallScore: score.overall,
          reasoning: score.reasoning,
          flags: score.flags,
          requiresHumanReview: requiresReview,
          // overall_score used as initial final_score (may be overridden by human reviewer)
          finalScore: score.overall,
        },
      });

      await tx.evaluationJob.update({
        where: { id: job.id },
        data: { status: "completed", completedAt: new Date() },
      });

      // ANALYSIS-REPORT constraint H9: If this request was part of an A/B experiment,
      // update variant_metrics eval columns with overall_score.
      // eval_score is used as A/B metric (uses overall_score per constraint M9).
      if (requestLog?.promptVersionId) {
        await updateVariantMetricsIfExperiment(
          tx,
          job.requestId,
          requestLog.promptVersionId,
          score.overall
        );
      }
    });
  } catch (error) {
    await prisma.evaluationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        lastError: error instanceof Error ? error.message : "Unknown error",
      },
    });
    throw error;
  }
}

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * ANALYSIS-REPORT constraint H9: Check if the evaluated request was part of an A/B experiment.
 * If so, update variant_metrics.eval_n and eval_score_sum so the experiment dashboard
 * can show average eval scores per variant.
 *
 * Phase 4 does NOT store experimentVariantId on request_logs — variant assignment is
 * deterministic via FNV-1a (requestId + experimentId). We re-derive the assigned variant
 * here using the same assignVariant() function used at request time.
 */
async function updateVariantMetricsIfExperiment(
  tx: PrismaTx,
  requestId: string,
  promptVersionId: string,
  overallScore: number
): Promise<void> {
  // Find running experiments that use this prompt version
  const experimentVariant = await tx.experimentVariant.findFirst({
    where: { promptVersionId },
    include: {
      experiment: {
        select: {
          id: true,
          status: true,
          variants: {
            select: { id: true, trafficWeight: true },
          },
        },
      },
    },
  });

  if (!experimentVariant) return;
  if (experimentVariant.experiment.status !== "running") return;

  // Re-derive variant assignment using FNV-1a (same logic as experiment-runner.ts)
  const splits = experimentVariant.experiment.variants.map((v) => v.trafficWeight);
  const variantIndex = assignVariant(requestId, experimentVariant.experimentId, splits);
  const assignedVariant = experimentVariant.experiment.variants[variantIndex];
  if (!assignedVariant) return;

  // Update the accumulator columns atomically
  await tx.$executeRaw`
    UPDATE variant_metrics
    SET eval_score_sum = COALESCE(eval_score_sum, 0) + ${overallScore},
        eval_n = COALESCE(eval_n, 0) + 1
    WHERE variant_id = ${assignedVariant.id}::uuid
  `;
}
