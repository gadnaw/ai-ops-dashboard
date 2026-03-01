// src/app/api/v1/degradation/[eventId]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/v1/degradation/[eventId]
 * Returns a single rate_limit_event by ID with full details.
 * Used by the StageDetailPanel when user clicks an event.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;

    const event = await prisma.rateLimitEvent.findUnique({
      where: { id: eventId },
      include: {
        apiKey: {
          select: { id: true, keyPrefix: true, label: true },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error("GET /api/v1/degradation/[eventId] failed:", error);
    return NextResponse.json({ error: "Failed to fetch event" }, { status: 500 });
  }
}
