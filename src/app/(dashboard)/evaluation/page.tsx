import { prisma } from "@/lib/db/prisma";
import { EvalTrendLazy } from "@/components/evaluation/lazy";
import { ScoreDisplay } from "@/components/evaluation/ScoreDisplay";
import Link from "next/link";

export const revalidate = 0; // Force-dynamic; cannot use `export const dynamic` due to lazy import

interface DailyTrendRow {
  date: string;
  avg_score: number;
  count: bigint;
}

interface ModelBreakdownRow {
  model: string;
  avg_score: number;
  count: bigint;
}

async function getEvaluationStats() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Aggregate daily average scores for the trend chart
  const dailyTrend = await prisma.$queryRaw<DailyTrendRow[]>`
    SELECT
      DATE(created_at) AS date,
      ROUND(AVG(overall_score)::numeric, 2) AS avg_score,
      COUNT(*) AS count
    FROM evaluation_scores
    WHERE created_at >= ${thirtyDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `;

  // Overall stats for the last 30 days
  const stats = await prisma.evaluationScore.aggregate({
    where: { createdAt: { gte: thirtyDaysAgo } },
    _avg: { overallScore: true },
    _count: { id: true },
  });

  // Pending review count
  const pendingReviewCount = await prisma.evaluationScore.count({
    where: { requiresHumanReview: true, humanReviewed: false },
  });

  // Breakdown by model (top 5) -- raw SQL because no FK relation to request_logs
  const modelBreakdown = await prisma.$queryRaw<ModelBreakdownRow[]>`
    SELECT
      r.model,
      ROUND(AVG(e.overall_score)::numeric, 2) AS avg_score,
      COUNT(*) AS count
    FROM evaluation_scores e
    JOIN request_logs r ON e.request_id = r.id
    WHERE e.created_at >= ${thirtyDaysAgo}
    GROUP BY r.model
    ORDER BY count DESC
    LIMIT 5
  `;

  return { dailyTrend, stats, pendingReviewCount, modelBreakdown };
}

export default async function EvaluationPage() {
  const { dailyTrend, stats, pendingReviewCount, modelBreakdown } = await getEvaluationStats();

  const trendData = dailyTrend.map((row) => ({
    date: String(row.date),
    avgScore: Number(row.avg_score),
    count: Number(row.count),
  }));

  const avgScore = stats._avg.overallScore ? Number(stats._avg.overallScore) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Evaluation</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            LLM-as-judge quality scoring for the last 30 days
          </p>
        </div>
        {pendingReviewCount > 0 && (
          <Link
            href="/evaluation/review"
            className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-xs text-white">
              {pendingReviewCount > 99 ? "99+" : pendingReviewCount}
            </span>
            Review Queue
          </Link>
        )}
      </div>

      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-muted-foreground text-sm">Avg Overall Score</p>
          <div className="mt-1">
            {avgScore != null ? (
              <ScoreDisplay score={avgScore} />
            ) : (
              <p className="text-2xl font-bold text-slate-300">{"\u2014"}</p>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-muted-foreground text-sm">Total Evaluated</p>
          <p className="text-2xl font-bold">{stats._count.id.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-muted-foreground text-sm">Pending Review</p>
          <p className={`text-2xl font-bold ${pendingReviewCount > 0 ? "text-orange-600" : ""}`}>
            {pendingReviewCount}
          </p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-muted-foreground text-sm">Below Threshold</p>
          <p className="text-2xl font-bold text-red-600">
            {stats._count.id > 0
              ? `${Math.round((pendingReviewCount / stats._count.id) * 100)}%`
              : "\u2014"}
          </p>
        </div>
      </div>

      {/* Score trend chart */}
      <div className="mb-6 rounded-lg border bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-slate-700">
          Average Quality Score -- Last 30 Days
        </h2>
        <EvalTrendLazy data={trendData} reviewThreshold={3} />
      </div>

      {/* Per-model breakdown */}
      {modelBreakdown.length > 0 && (
        <div className="rounded-lg border bg-white p-4">
          <h2 className="mb-4 text-sm font-medium text-slate-700">Score by Model</h2>
          <div className="space-y-2">
            {modelBreakdown.map((row) => (
              <div
                key={row.model}
                className="flex items-center justify-between border-b py-2 last:border-0"
              >
                <span className="font-mono text-sm text-slate-600">{row.model}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {Number(row.count).toLocaleString()} evals
                  </span>
                  <ScoreDisplay score={Number(row.avg_score)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
