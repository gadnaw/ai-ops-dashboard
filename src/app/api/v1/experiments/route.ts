// src/app/api/v1/experiments/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

/** GET /api/v1/experiments — list all experiments */
export async function GET() {
  try {
    const experiments = await prisma.experiment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        variants: {
          select: {
            id: true,
            name: true,
            promptVersionId: true,
            trafficWeight: true,
            isControl: true,
          },
        },
        _count: { select: { metrics: true } },
      },
    });
    return NextResponse.json({ experiments });
  } catch (err) {
    console.error("GET /api/v1/experiments failed:", err);
    return NextResponse.json({ error: "Failed to fetch experiments" }, { status: 500 });
  }
}

interface CreateVariant {
  name: string;
  promptVersionId?: string;
  modelOverride?: string;
  trafficWeight: number;
  isControl: boolean;
}

interface CreateExperimentBody {
  name: string;
  description?: string;
  hypothesis?: string;
  primaryMetric?: string;
  mde: number;
  mdeUnit?: string;
  minSamples?: number;
  maxSamples?: number;
  createdBy: string; // profile UUID
  variants: CreateVariant[];
}

/** POST /api/v1/experiments — create a new experiment */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateExperimentBody;

    if (!body.name || !body.mde || !body.variants || body.variants.length < 2) {
      return NextResponse.json(
        { error: "name, mde, and at least 2 variants are required" },
        { status: 400 }
      );
    }

    // Validate traffic weights sum to 1.0 (within floating point tolerance)
    const totalWeight = body.variants.reduce((sum, v) => sum + v.trafficWeight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      return NextResponse.json(
        { error: "Variant traffic weights must sum to 1.0" },
        { status: 400 }
      );
    }

    const experiment = await prisma.experiment.create({
      data: {
        name: body.name,
        ...(body.description ? { description: body.description } : {}),
        ...(body.hypothesis ? { hypothesis: body.hypothesis } : {}),
        primaryMetric: body.primaryMetric ?? "error_rate",
        mde: body.mde,
        mdeUnit: body.mdeUnit ?? "absolute",
        minSamples: body.minSamples ?? 200,
        maxSamples: body.maxSamples ?? 5000,
        createdBy: body.createdBy,
        status: "draft",
        variants: {
          create: body.variants.map((v) => ({
            name: v.name,
            promptVersionId: v.promptVersionId ?? null,
            modelOverride: v.modelOverride ?? null,
            trafficWeight: v.trafficWeight,
            isControl: v.isControl,
          })),
        },
      },
      include: { variants: true },
    });

    return NextResponse.json({ experiment }, { status: 201 });
  } catch (err) {
    console.error("POST /api/v1/experiments failed:", err);
    return NextResponse.json({ error: "Failed to create experiment" }, { status: 500 });
  }
}
