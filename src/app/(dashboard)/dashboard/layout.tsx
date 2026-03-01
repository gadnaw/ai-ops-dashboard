import type { ReactNode } from "react";
import { RealtimeFeed } from "@/components/dashboard/RealtimeFeed";
import { FilterBar } from "@/components/dashboard/FilterBar";

// Dashboard layout — PUBLIC, no requireAuth().
// Receives 4 parallel route slots: cost, latency, requests, models.
export default function DashboardLayout({
  children,
  cost,
  latency,
  requests,
  models,
}: {
  children: ReactNode;
  cost: ReactNode;
  latency: ReactNode;
  requests: ReactNode;
  models: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Dashboard header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">AI Ops Dashboard</h1>
              <p className="text-xs text-gray-500">Production LLM Monitoring</p>
            </div>
            <div className="flex items-center gap-4">
              <RealtimeFeed />
              <FilterBar />
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Children slot (summary stats row) */}
        <div className="mb-6">{children}</div>

        {/* Parallel route grid — 2 columns on large screens, 1 on mobile */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-gray-700 uppercase">
              Cost Trend
            </h2>
            {cost}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-gray-700 uppercase">
              Latency Percentiles
            </h2>
            {latency}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-gray-700 uppercase">
              Request Volume
            </h2>
            {requests}
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold tracking-wide text-gray-700 uppercase">
              Model Distribution
            </h2>
            {models}
          </div>
        </div>
      </div>
    </div>
  );
}
