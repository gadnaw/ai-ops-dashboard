import { prisma } from "@/lib/db/prisma";
import { AlertRuleForm } from "@/components/alerts/AlertRuleForm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<string, string> = {
  cost_per_window: "Cost/window",
  p95_latency_ms: "p95 Latency",
  error_rate_pct: "Error rate",
  eval_score_avg: "Avg eval score",
};

export default async function AlertRulesPage() {
  const rules = await prisma.alertRule.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { history: true } },
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alert Rules</h1>
          <p className="mt-1 text-sm text-slate-500">
            Configure thresholds that trigger webhook notifications
          </p>
        </div>
        <Link
          href="/alerts"
          className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-slate-50"
        >
          View History
        </Link>
      </div>

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="mb-8 rounded-lg border bg-white">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-medium">Active Rules</h2>
          </div>
          <div className="divide-y">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{rule.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {METRIC_LABELS[rule.metric] ?? rule.metric} &gt;{" "}
                    {Number(rule.thresholdValue).toFixed(2)} over {rule.windowMinutes}m{" -- "}
                    cooldown {rule.cooldownMinutes}m
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{rule._count.history} fires</span>
                  {rule.isActive ? (
                    <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs text-green-700">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      Paused
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create new rule form */}
      <div className="rounded-lg border bg-white">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-medium">Create New Rule</h2>
        </div>
        <div className="px-4 py-4">
          <AlertRuleForm />
        </div>
      </div>
    </div>
  );
}
