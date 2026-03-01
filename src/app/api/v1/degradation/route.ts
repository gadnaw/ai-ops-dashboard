// src/app/api/v1/degradation/route.ts
import { NextResponse } from "next/server";
import {
  getDegradationEvents,
  groupIntoChains,
  getDegradationStats,
} from "@/lib/degradation/queries";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/degradation
 * Returns recent degradation events and chains for the visualization.
 * Query params:
 *   limit (default 100) — max events to return
 *   window (default 60) — minutes of history
 *   format (default 'chains') — 'events' | 'chains'
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get("limit") ?? "100", 10);
    const windowMinutes = parseInt(url.searchParams.get("window") ?? "60", 10);
    const format = url.searchParams.get("format") ?? "chains";

    const [events, stats] = await Promise.all([
      getDegradationEvents(limit, windowMinutes),
      getDegradationStats(windowMinutes),
    ]);

    if (format === "events") {
      return NextResponse.json({ events, stats });
    }

    const chains = groupIntoChains(events);
    return NextResponse.json({ chains, stats, eventCount: events.length });
  } catch (error) {
    console.error("GET /api/v1/degradation failed:", error);
    return NextResponse.json({ error: "Failed to fetch degradation events" }, { status: 500 });
  }
}
