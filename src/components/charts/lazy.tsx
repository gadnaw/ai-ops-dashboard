"use client";

import dynamic from "next/dynamic";

const loading = () => <div className="h-[300px] animate-pulse rounded bg-gray-100" />;

export const CostTrendChartLazy = dynamic(
  () => import("./CostTrendChart").then((m) => m.CostTrendChart),
  { ssr: false, loading }
);

export const LatencyChartLazy = dynamic(
  () => import("./LatencyChart").then((m) => m.LatencyChart),
  { ssr: false, loading }
);

export const RequestVolumeChartLazy = dynamic(
  () => import("./RequestVolumeChart").then((m) => m.RequestVolumeChart),
  { ssr: false, loading }
);

export const ModelPieChartLazy = dynamic(
  () => import("./ModelPieChart").then((m) => m.ModelPieChart),
  { ssr: false, loading }
);
