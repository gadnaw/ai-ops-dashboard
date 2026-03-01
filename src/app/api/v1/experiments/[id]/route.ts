// src/app/api/v1/experiments/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rollbackToVersion } from "@/lib/prompts/actions";

export const dynamic = "force-dynamic";

/** GET /api/v1/experiments/[id] — get full experiment detail */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        variants: {
          include: {
            metrics: true,
          },
        },
      },
    });

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    return NextResponse.json({ experiment });
  } catch (err) {
    console.error("GET /api/v1/experiments/[id] failed:", err);
    return NextResponse.json({ error: "Failed to fetch experiment" }, { status: 500 });
  }
}

interface PatchBody {
  action: "start" | "stop" | "promote_winner";
  winnerVariantId?: string;
}

/**
 * PATCH /api/v1/experiments/[id]
 * Actions: start | stop | promote_winner
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json()) as PatchBody;

    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: { variants: true },
    });

    if (!experiment) {
      return NextResponse.json({ error: "Experiment not found" }, { status: 404 });
    }

    if (body.action === "start") {
      if (experiment.status !== "draft") {
        return NextResponse.json(
          { error: "Only draft experiments can be started" },
          { status: 400 }
        );
      }
      await prisma.experiment.update({
        where: { id },
        data: { status: "running", startedAt: new Date() },
      });
    } else if (body.action === "stop") {
      await prisma.experiment.update({
        where: { id },
        data: { status: "stopped", stoppedAt: new Date() },
      });
    } else if (body.action === "promote_winner") {
      // Success criterion 5: promote winning variant to primary active version
      const winnerId = body.winnerVariantId ?? experiment.winnerVariantId;
      if (!winnerId) {
        return NextResponse.json({ error: "No winner variant specified" }, { status: 400 });
      }

      const winnerVariant = experiment.variants.find((v) => v.id === winnerId);
      if (!winnerVariant?.promptVersionId) {
        return NextResponse.json(
          { error: "Winner variant has no prompt version to promote" },
          { status: 400 }
        );
      }

      // Look up the template for this prompt version
      const promptVersion = await prisma.promptVersion.findUnique({
        where: { id: winnerVariant.promptVersionId },
        select: { templateId: true },
      });

      if (promptVersion) {
        // Promote by rolling back template to the winning version
        await rollbackToVersion(promptVersion.templateId, winnerVariant.promptVersionId);
      }

      await prisma.experiment.update({
        where: { id },
        data: {
          status: "completed",
          stoppedAt: new Date(),
          winnerVariantId: winnerId,
        },
      });
    }

    const updated = await prisma.experiment.findUnique({
      where: { id },
      include: { variants: { include: { metrics: true } } },
    });

    return NextResponse.json({ experiment: updated });
  } catch (err) {
    console.error("PATCH /api/v1/experiments/[id] failed:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
