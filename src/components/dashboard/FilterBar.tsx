"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDashboardFilterStore } from "@/stores/dashboard-filter";
import type { TimeRange } from "@/lib/dashboard/queries";

const TIME_RANGE_OPTIONS: Array<{ label: string; value: TimeRange }> = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

// Extracted outside component scope — React compiler immutability rule
// only flags mutations of external values inside component/hook bodies.
function persistTimeRangeCookie(range: TimeRange) {
  document.cookie = `dashboard-time-range=${range};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
}

export function FilterBar() {
  const { timeRange, setTimeRange, _hasHydrated, setHasHydrated } = useDashboardFilterStore();
  const router = useRouter();

  // Manual hydration — skipHydration prevents SSR mismatch (Pitfall 10)
  useEffect(() => {
    useDashboardFilterStore.persist.rehydrate();
    setHasHydrated(true);
  }, [setHasHydrated]);

  function handleTimeRangeChange(range: TimeRange) {
    setTimeRange(range);
    persistTimeRangeCookie(range);
    router.refresh();
  }

  if (!_hasHydrated) {
    // Render skeleton during hydration to prevent flash of incorrect content
    return <div className="h-9 w-48 animate-pulse rounded-md bg-gray-200" />;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-gray-600">Time range:</span>
      <div className="flex overflow-hidden rounded-md border border-gray-200">
        {TIME_RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => handleTimeRangeChange(option.value)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              timeRange === option.value
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
