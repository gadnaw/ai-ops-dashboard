"use client";

import dynamic from "next/dynamic";

const loadingChart = () => <div className="h-60 animate-pulse rounded-lg bg-gray-100" />;

export const EvalTrendLazy = dynamic(
  () => import("@/components/evaluation/EvalTrend").then((m) => m.EvalTrend),
  { ssr: false, loading: loadingChart }
);
