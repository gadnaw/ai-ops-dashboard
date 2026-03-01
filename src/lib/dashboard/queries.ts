import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// Time range to SQL interval and bucket size mapping
// Keeps chart data within 200-500 points (locked CONTEXT.md decision)
// 24h → 15-min buckets = 96 points max
// 7d  → 1-hour buckets = 168 points max
// 30d → 6-hour buckets = 120 points max
export type TimeRange = "24h" | "7d" | "30d";

const VALID_TIME_RANGES = new Set<string>(["24h", "7d", "30d"]);

// Read time range from cookie set by FilterBar. Default to 30d to show full seed data including day-15 spike.
export async function getTimeRangeFromCookies(): Promise<TimeRange> {
  const cookieStore = await cookies();
  const value = cookieStore.get("dashboard-time-range")?.value;
  if (value && VALID_TIME_RANGES.has(value)) {
    return value as TimeRange;
  }
  return "30d";
}

function getTimeBucketSQL(timeRange: TimeRange): string {
  switch (timeRange) {
    case "24h":
      return "15 minutes";
    case "7d":
      return "1 hour";
    case "30d":
      return "6 hours";
  }
}

function getStartTime(timeRange: TimeRange): Date {
  const now = new Date();
  switch (timeRange) {
    case "24h": {
      const d = new Date(now);
      d.setHours(now.getHours() - 24);
      return d;
    }
    case "7d": {
      const d = new Date(now);
      d.setDate(now.getDate() - 7);
      return d;
    }
    case "30d": {
      const d = new Date(now);
      d.setDate(now.getDate() - 30);
      return d;
    }
  }
}

// Cost trend by provider — aggregated from hourly_cost_summary mat view.
// Returns data bucketed at the appropriate granularity for the selected time range.
export async function fetchCostSummary(
  timeRange: TimeRange,
  providers?: string[]
): Promise<
  Array<{
    bucket: string;
    provider: string;
    model: string;
    total_cost: number;
    request_count: number;
    error_count: number;
  }>
> {
  const startTime = getStartTime(timeRange);
  const bucket = getTimeBucketSQL(timeRange);

  // Use Prisma.sql for dynamic provider filter — cannot nest $queryRaw calls
  const providerFilter =
    providers && providers.length > 0 ? Prisma.sql`AND provider = ANY(${providers})` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      provider: string;
      model: string;
      total_cost: number;
      request_count: bigint;
      error_count: bigint;
    }>
  >(
    Prisma.sql`
    SELECT
      date_trunc(${bucket}, hour)  AS bucket,
      provider,
      model,
      SUM(total_cost)              AS total_cost,
      SUM(request_count)           AS request_count,
      SUM(error_count)             AS error_count
    FROM hourly_cost_summary
    WHERE hour >= ${startTime}
    ${providerFilter}
    GROUP BY date_trunc(${bucket}, hour), provider, model
    ORDER BY bucket ASC
  `
  );

  // Note: Prisma $queryRaw returns BigInt for COUNT columns — convert to number
  return rows.map((r) => ({
    bucket: r.bucket.toISOString(),
    provider: r.provider,
    model: r.model,
    total_cost: Number(r.total_cost),
    request_count: Number(r.request_count),
    error_count: Number(r.error_count),
  }));
}

// Latency percentiles from hourly_latency_percentiles mat view.
export async function fetchLatencyPercentiles(
  timeRange: TimeRange,
  providers?: string[]
): Promise<
  Array<{
    bucket: string;
    provider: string;
    p50: number;
    p95: number;
    p99: number;
    sample_count: number;
  }>
> {
  const startTime = getStartTime(timeRange);
  const bucket = getTimeBucketSQL(timeRange);

  const providerFilter =
    providers && providers.length > 0 ? Prisma.sql`AND provider = ANY(${providers})` : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      provider: string;
      p50: number;
      p95: number;
      p99: number;
      sample_count: bigint;
    }>
  >(
    Prisma.sql`
    SELECT
      date_trunc(${bucket}, hour)                                  AS bucket,
      provider,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY p50)            AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY p95)            AS p95,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY p99)            AS p99,
      SUM(sample_count)                                             AS sample_count
    FROM hourly_latency_percentiles
    WHERE hour >= ${startTime}
    ${providerFilter}
    GROUP BY date_trunc(${bucket}, hour), provider
    ORDER BY bucket ASC
  `
  );

  return rows.map((r) => ({
    bucket: r.bucket.toISOString(),
    provider: r.provider,
    p50: Number(r.p50),
    p95: Number(r.p95),
    p99: Number(r.p99),
    sample_count: Number(r.sample_count),
  }));
}

// Model distribution from daily_model_breakdown mat view.
export async function fetchDailyModelBreakdown(timeRange: TimeRange): Promise<
  Array<{
    model: string;
    provider: string;
    total_requests: number;
    total_cost: number;
  }>
> {
  const startTime = getStartTime(timeRange);

  const rows = await prisma.$queryRaw<
    Array<{
      model: string;
      provider: string;
      total_requests: bigint;
      total_cost: number;
    }>
  >(
    Prisma.sql`
    SELECT
      model,
      provider,
      SUM(request_count) AS total_requests,
      SUM(total_cost)    AS total_cost
    FROM daily_model_breakdown
    WHERE day >= ${startTime}
    GROUP BY model, provider
    ORDER BY total_requests DESC
  `
  );

  return rows.map((r) => ({
    model: r.model,
    provider: r.provider,
    total_requests: Number(r.total_requests),
    total_cost: Number(r.total_cost),
  }));
}

// Request volume by hour (for bar chart) — reads from hourly_cost_summary.
export async function fetchRequestVolume(timeRange: TimeRange): Promise<
  Array<{
    bucket: string;
    total_requests: number;
    error_requests: number;
    fallback_requests: number;
  }>
> {
  const startTime = getStartTime(timeRange);
  const bucket = getTimeBucketSQL(timeRange);

  const rows = await prisma.$queryRaw<
    Array<{
      bucket: Date;
      total_requests: bigint;
      error_requests: bigint;
      fallback_requests: bigint;
    }>
  >(
    Prisma.sql`
    SELECT
      date_trunc(${bucket}, hour)  AS bucket,
      SUM(request_count)           AS total_requests,
      SUM(error_count)             AS error_requests,
      SUM(fallback_count)          AS fallback_requests
    FROM hourly_cost_summary
    WHERE hour >= ${startTime}
    GROUP BY date_trunc(${bucket}, hour)
    ORDER BY bucket ASC
  `
  );

  return rows.map((r) => ({
    bucket: r.bucket.toISOString(),
    total_requests: Number(r.total_requests),
    error_requests: Number(r.error_requests),
    fallback_requests: Number(r.fallback_requests),
  }));
}
