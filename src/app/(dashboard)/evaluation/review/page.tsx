import { prisma } from "@/lib/db/prisma";
import { ReviewInteractionPanel } from "@/components/evaluation/ReviewInteractionPanel";
import { ScoreDisplay } from "@/components/evaluation/ScoreDisplay";
import { QueueStats } from "@/components/evaluation/QueueStats";

export const revalidate = 0; // Always fetch fresh review queue

interface PendingScoreRow {
  id: string;
  overall_score: number;
  dimension_scores: Record<string, number>;
  reasoning: string;
  flags: string[];
  prompt_text: string | null;
  response_text: string | null;
  model: string | null;
  provider: string | null;
  request_created_at: Date | null;
}

interface RubricDimension {
  id: string;
  name: string;
  description: string;
  weight: number;
  anchors: Record<string, string>;
}

async function getQueueData() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingScores, reviewedTodayCount, defaultRubric] = await Promise.all([
    // Pending review items -- worst scores first
    // Raw SQL because EvaluationScore has no Prisma relation to RequestLog (partitioned table)
    prisma.$queryRaw<PendingScoreRow[]>`
      SELECT
        e.id,
        e.overall_score,
        e.dimension_scores,
        e.reasoning,
        e.flags,
        r.prompt_text,
        r.response_text,
        r.model,
        r.provider,
        r.created_at AS request_created_at
      FROM evaluation_scores e
      LEFT JOIN request_logs r ON e.request_id = r.id
      WHERE e.requires_human_review = true
        AND e.human_reviewed = false
      ORDER BY e.overall_score ASC
      LIMIT 50
    `,
    // Count reviewed today
    prisma.evaluationScore.count({
      where: {
        humanReviewed: true,
        finalScoredAt: { gte: todayStart },
      },
    }),
    // Get rubric dimensions for UI labels
    prisma.evaluationRubric.findFirst({
      where: { isActive: true },
      select: { dimensions: true },
    }),
  ]);

  const avgPendingScore =
    pendingScores.length > 0
      ? pendingScores.reduce((sum, s) => sum + Number(s.overall_score), 0) / pendingScores.length
      : null;

  const rubricDimensions = (defaultRubric?.dimensions ?? []) as unknown as RubricDimension[];

  return { pendingScores, reviewedTodayCount, avgPendingScore, rubricDimensions };
}

export default async function ReviewQueuePage() {
  const { pendingScores, reviewedTodayCount, avgPendingScore, rubricDimensions } =
    await getQueueData();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Human Review Queue</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Requests where judge LLM scored any dimension below 3. Review to confirm or correct.
        </p>
      </div>

      <QueueStats
        pendingCount={pendingScores.length}
        reviewedTodayCount={reviewedTodayCount}
        avgPendingScore={avgPendingScore}
      />

      {pendingScores.length === 0 ? (
        <div className="text-muted-foreground py-16 text-center">
          <p className="text-lg font-medium">Review queue is empty</p>
          <p className="mt-1 text-sm">All evaluation scores are within acceptable thresholds.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pendingScores.map((score) => {
            const judgeScores = score.dimension_scores;

            return (
              <div key={score.id} className="overflow-hidden rounded-lg border bg-white shadow-sm">
                {/* Card header */}
                <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <ScoreDisplay score={Number(score.overall_score)} label="Overall" />
                    <span className="text-xs text-slate-500">
                      {score.model ?? "Unknown model"} &middot;{" "}
                      {score.request_created_at
                        ? new Date(score.request_created_at).toLocaleDateString()
                        : ""}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {Object.entries(judgeScores).map(([dim, val]) => (
                      <ScoreDisplay
                        key={dim}
                        score={val}
                        label={dim.charAt(0).toUpperCase() + dim.slice(1, 3)}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>

                {/* Request/response */}
                <div className="grid grid-cols-2 gap-4 border-b px-4 py-3">
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Original prompt
                    </p>
                    <p className="line-clamp-4 text-sm text-slate-700">
                      {score.prompt_text ?? "(prompt not stored)"}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">
                      Model response
                    </p>
                    <p className="line-clamp-4 text-sm text-slate-700">
                      {score.response_text ?? "(response not stored)"}
                    </p>
                  </div>
                </div>

                {/* Interactive review panel (Client Island) */}
                <div className="px-4 py-4">
                  <ReviewInteractionPanel
                    scoreId={score.id}
                    judgeScores={judgeScores}
                    reasoning={score.reasoning}
                    flags={score.flags}
                    rubricDimensions={rubricDimensions}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
