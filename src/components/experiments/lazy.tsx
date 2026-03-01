"use client";

import dynamic from "next/dynamic";

const loadingChart = () => <div className="h-60 animate-pulse rounded-lg bg-gray-100" />;
const loadingTable = () => <div className="h-32 animate-pulse rounded-lg bg-gray-100" />;

export const SPRTChartLazy = dynamic(
  () => import("@/app/(dashboard)/experiments/[id]/components/SPRTChart").then((m) => m.SPRTChart),
  { ssr: false, loading: loadingChart }
);

export const VariantMetricsTableLazy = dynamic(
  () =>
    import("@/app/(dashboard)/experiments/[id]/components/VariantMetricsTable").then(
      (m) => m.VariantMetricsTable
    ),
  { ssr: false, loading: loadingTable }
);

export const ExperimentControlsLazy = dynamic(
  () =>
    import("@/app/(dashboard)/experiments/[id]/components/ExperimentControls").then(
      (m) => m.ExperimentControls
    ),
  { ssr: false }
);
