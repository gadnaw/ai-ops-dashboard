"use client";

// Lazy loader for degradation components that use Recharts.
// Must be a "use client" file — next/dynamic ssr:false cannot be used in Server Components.
// This follows the same pattern as src/components/charts/lazy.tsx (Phase 2).
import dynamic from "next/dynamic";

const loading = () => <div className="h-64 animate-pulse rounded-lg bg-gray-100" />;

export const DegradationEventListLazy = dynamic(
  () => import("./DegradationEventList").then((m) => m.DegradationEventList),
  { ssr: false, loading }
);
