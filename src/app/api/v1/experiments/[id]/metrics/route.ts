// src/app/api/v1/experiments/[id]/metrics/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { computeVariantStats } from "@/lib/ab-testing/metrics";

export const dynamic = "force-dynamic";

/** GET /api/v1/experiments/[id]/metrics — variant metrics + SPRT history for charts */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [variantMetrics, sprtHistory] = await Promise.all([
      prisma.variantMetric.findMany({
        where: { experimentId: id },
        include: {
          variant: {
            select: { id: true, name: true, isControl: true, trafficWeight: true },
          },
        },
      }),
      prisma.sprtHistory.findMany({
        where: { experimentId: id },
        orderBy: { recordedAt: "asc" },
        select: {
          sampleCount: true,
          llr: true,
          upperBoundary: true,
          lowerBoundary: true,
          recordedAt: true,
        },
      }),
    ]);

    const variantStats = variantMetrics.map((m) => ({
      variantId: m.variantId,
      variantName: m.variant.name,
      isControl: m.variant.isControl,
      trafficWeight: m.variant.trafficWeight,
      stats: computeVariantStats({
        requestCount: m.requestCount,
        errorCount: m.errorCount,
        latencyN: m.latencyN,
        latencySum: m.latencySum,
        latencySumSq: m.latencySumSq,
        costN: m.costN,
        costSum: m.costSum,
        evalN: m.evalN,
        evalScoreSum: m.evalScoreSum,
        sprtLlr: m.sprtLlr,
        sprtDecision: m.sprtDecision,
      }),
    }));

    return NextResponse.json({ variantStats, sprtHistory });
  } catch (err) {
    console.error("GET /api/v1/experiments/[id]/metrics failed:", err);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
