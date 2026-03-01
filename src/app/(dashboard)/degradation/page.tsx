// src/app/(dashboard)/degradation/page.tsx
// Server Component — fetches rate_limit_events data server-side.
// revalidate = 0 forces fresh fetch on every request (real-time degradation data).
// Client Islands (Recharts) are imported via lazy.tsx which carries "use client".
import { Suspense } from "react";
import {
  getDegradationEvents,
  getDegradationStats,
  groupIntoChains,
} from "@/lib/degradation/queries";
import { DegradationEventListLazy } from "./components/lazy";

// Disable ISR — degradation events are real-time and must always be fresh
export const revalidate = 0;

export default async function DegradationPage() {
  const windowMinutes = 60;

  const [events, stats] = await Promise.all([
    getDegradationEvents(200, windowMinutes),
    getDegradationStats(windowMinutes),
  ]);

  const chains = groupIntoChains(events);

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Graceful Degradation</h1>
        <p className="mt-1 text-sm text-gray-500">
          Four-stage degradation chain — last {windowMinutes} minutes
        </p>
      </div>

      {/* Stats summary row */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Queued"
          value={stats.queueEvents}
          color="bg-blue-50 border-blue-200"
          textColor="text-blue-700"
        />
        <StatCard
          label="Fallback Used"
          value={stats.fallbackEvents}
          color="bg-amber-50 border-amber-200"
          textColor="text-amber-700"
        />
        <StatCard
          label="Cache Hits"
          value={stats.cacheHits}
          color="bg-purple-50 border-purple-200"
          textColor="text-purple-700"
        />
        <StatCard
          label="Rejected (429)"
          value={stats.rejections}
          color="bg-red-50 border-red-200"
          textColor="text-red-700"
        />
      </div>

      {/* Events section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">
            Recent Events
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({chains.length} chains, {events.length} events)
            </span>
          </h2>
        </div>

        <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-gray-100" />}>
          <DegradationEventListLazy chains={chains} />
        </Suspense>
      </div>

      {/* How it works explainer */}
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-gray-700">
          How the degradation chain works
        </h3>
        <div className="grid grid-cols-1 gap-3 text-xs text-gray-600 sm:grid-cols-4">
          <div className="flex gap-2">
            <span
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
              style={{ background: "#3b82f6" }}
            />
            <div>
              <strong>Stage 1: Queue</strong> — Wait up to 10s for the rate limit to refill
            </div>
          </div>
          <div className="flex gap-2">
            <span
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
              style={{ background: "#f59e0b" }}
            />
            <div>
              <strong>Stage 2: Fallback</strong> — Try a cheaper/faster model
            </div>
          </div>
          <div className="flex gap-2">
            <span
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
              style={{ background: "#8b5cf6" }}
            />
            <div>
              <strong>Stage 3: Cache</strong> — Serve a prior cached response
            </div>
          </div>
          <div className="flex gap-2">
            <span
              className="mt-0.5 h-4 w-4 flex-shrink-0 rounded"
              style={{ background: "#ef4444" }}
            />
            <div>
              <strong>Stage 4: Reject</strong> — 429 with Retry-After header
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  textColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}
