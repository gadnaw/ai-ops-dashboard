import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";

interface ScoreRow {
  id: string;
  overall_score: number;
  final_score: number | null;
  dimension_scores: Record<string, number>;
  requires_human_review: boolean;
  human_reviewed: boolean;
  created_at: Date;
  judge_model: string;
  model: string | null;
  provider: string | null;
  prompt_version_id: string | null;
  endpoint: string | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? "50")));
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days") ?? "30")));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const offset = (page - 1) * pageSize;

  // Use raw SQL because EvaluationScore has no Prisma relation to RequestLog (partitioned table)
  const [scores, countResult] = await Promise.all([
    prisma.$queryRaw<ScoreRow[]>`
      SELECT
        e.id,
        e.overall_score,
        e.final_score,
        e.dimension_scores,
        e.requires_human_review,
        e.human_reviewed,
        e.created_at,
        e.judge_model,
        r.model,
        r.provider,
        r.prompt_version_id,
        r.endpoint
      FROM evaluation_scores e
      LEFT JOIN request_logs r ON e.request_id = r.id
      WHERE e.created_at >= ${since}
      ORDER BY e.created_at DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `,
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count
      FROM evaluation_scores
      WHERE created_at >= ${since}
    `,
  ]);

  const total = Number(countResult[0].count);

  const formattedScores = scores.map((s) => ({
    id: s.id,
    overallScore: Number(s.overall_score),
    finalScore: s.final_score != null ? Number(s.final_score) : null,
    dimensionScores: s.dimension_scores,
    requiresHumanReview: s.requires_human_review,
    humanReviewed: s.human_reviewed,
    createdAt: s.created_at,
    judgeModel: s.judge_model,
    request: {
      model: s.model,
      provider: s.provider,
      promptVersionId: s.prompt_version_id,
      endpoint: s.endpoint,
    },
  }));

  return Response.json({
    scores: formattedScores,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
}
