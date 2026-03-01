// src/app/(dashboard)/experiments/[id]/page.tsx
// Server Component — uses lazy wrappers from src/components/experiments/lazy.tsx
// (not next/dynamic directly — that fails in Server Components per Next.js 16 pitfall P18)
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { computeVariantStats } from "@/lib/ab-testing/metrics";
import {
  SPRTChartLazy,
  VariantMetricsTableLazy,
  ExperimentControlsLazy,
} from "@/components/experiments/lazy";

export const revalidate = 0;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  stopped: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const experiment = await prisma.experiment.findUnique({
    where: { id },
    include: {
      variants: {
        include: { metrics: true },
      },
    },
  });

  if (!experiment) notFound();

  const sprtHistory = await prisma.sprtHistory.findMany({
    where: { experimentId: id },
    orderBy: { recordedAt: "asc" },
    select: { sampleCount: true, llr: true, upperBoundary: true, lowerBoundary: true },
  });

  const variantRows = experiment.variants.map((v) => ({
    variantId: v.id,
    variantName: v.name,
    isControl: v.isControl,
    trafficWeight: v.trafficWeight,
    stats: v.metrics
      ? computeVariantStats({
          requestCount: v.metrics.requestCount,
          errorCount: v.metrics.errorCount,
          latencyN: v.metrics.latencyN,
          latencySum: v.metrics.latencySum,
          latencySumSq: v.metrics.latencySumSq,
          costN: v.metrics.costN,
          costSum: v.metrics.costSum,
          evalN: v.metrics.evalN,
          evalScoreSum: v.metrics.evalScoreSum,
          sprtLlr: v.metrics.sprtLlr,
          sprtDecision: v.metrics.sprtDecision,
        })
      : {
          requestCount: 0,
          errorCount: 0,
          errorRate: 0,
          avgLatencyMs: 0,
          avgCostUsd: 0,
          avgEvalScore: null,
          sprtLlr: 0,
          sprtDecision: null,
        },
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{experiment.name}</h1>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[experiment.status] ?? ""}`}
          >
            {experiment.status}
          </span>
        </div>
        {experiment.description && (
          <p className="text-sm text-gray-500">{experiment.description}</p>
        )}
        <div className="mt-2 space-x-4 text-xs text-gray-400">
          <span>Metric: {experiment.primaryMetric}</span>
          <span>
            MDE: {experiment.mde} ({experiment.mdeUnit})
          </span>
          <span>Min samples: {experiment.minSamples}</span>
          <span>
            &alpha;={experiment.alpha} &beta;={experiment.beta}
          </span>
        </div>
      </div>

      {/* Controls */}
      <ExperimentControlsLazy
        experimentId={experiment.id}
        status={experiment.status}
        winnerVariantId={experiment.winnerVariantId}
        variants={experiment.variants.map((v) => ({
          id: v.id,
          name: v.name,
          isControl: v.isControl,
        }))}
      />

      {/* SPRT Chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <SPRTChartLazy
          sprtHistory={sprtHistory}
          minSamples={experiment.minSamples}
          status={experiment.status}
        />
      </div>

      {/* Variant Metrics Table */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-base font-semibold text-gray-800">Per-Variant Metrics</h2>
        <VariantMetricsTableLazy variants={variantRows} minSamples={experiment.minSamples} />
        <p className="mt-3 text-xs text-gray-400">
          Eval scores populated by Phase 5 evaluation pipeline (shown as &mdash; until available).
          SPRT status requires {experiment.minSamples} samples per variant before checking
          significance.
        </p>
      </div>
    </div>
  );
}
