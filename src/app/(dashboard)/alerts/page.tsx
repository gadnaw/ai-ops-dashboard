import { prisma } from "@/lib/db/prisma";
import { AlertHistoryTable } from "@/components/alerts/AlertHistoryTable";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getAlertHistory() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const history = await prisma.alertHistory.findMany({
    where: { triggeredAt: { gte: thirtyDaysAgo } },
    orderBy: { triggeredAt: "desc" },
    take: 100,
    include: {
      rule: { select: { name: true, metric: true } },
    },
  });

  const activeCount = history.filter(
    (h) => h.status === "fired" || h.status === "acknowledged"
  ).length;

  return { history, activeCount };
}

export default async function AlertsPage() {
  const { history, activeCount } = await getAlertHistory();

  const entries = history.map((h) => ({
    id: h.id,
    ruleName: h.rule.name,
    metric: h.rule.metric,
    metricValue: Number(h.metricValue),
    thresholdValue: Number(h.thresholdValue),
    status: h.status as "fired" | "acknowledged" | "resolved",
    triggeredAt: h.triggeredAt.toISOString(),
    acknowledgedAt: h.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: h.resolvedAt?.toISOString() ?? null,
    webhookAttempts: h.webhookAttempts,
    webhookStatusCode: h.webhookStatusCode,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Anomaly alerts for cost spikes, latency regressions, and quality drops
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeCount > 0 && (
            <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
              {activeCount} active
            </span>
          )}
          <Link
            href="/alerts/rules"
            className="rounded-md border px-3 py-2 text-sm transition-colors hover:bg-slate-50"
          >
            Manage Rules
          </Link>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <AlertHistoryTable entries={entries} />
      </div>
    </div>
  );
}
