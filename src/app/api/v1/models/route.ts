import { prisma } from "@/lib/db/prisma";
import { MODEL_DISPLAY_NAMES } from "@/lib/model-router/types";

// GET /api/v1/models — returns available models and active endpoint configs
// Public endpoint — no auth required (read-only config data, no PII)
export async function GET() {
  const [endpointConfigs, rateCards] = await Promise.all([
    prisma.endpointConfig.findMany({
      where: { isActive: true },
      select: {
        endpointName: true,
        primaryModel: true,
        fallbackChain: true,
        temperature: true,
        maxTokens: true,
      },
    }),
    prisma.costRateCard.findMany({
      where: { isActive: true },
      select: {
        modelId: true,
        provider: true,
        displayName: true,
        inputPricePerMTokens: true,
        outputPricePerMTokens: true,
      },
    }),
  ]);

  const models = rateCards.map((card) => ({
    id: card.modelId,
    provider: card.provider,
    displayName: card.displayName ?? MODEL_DISPLAY_NAMES[card.modelId] ?? card.modelId,
    pricing: {
      inputPerMTokens: Number(card.inputPricePerMTokens),
      outputPerMTokens: Number(card.outputPricePerMTokens),
    },
  }));

  return Response.json({
    models,
    endpoints: endpointConfigs.map((e) => ({
      name: e.endpointName,
      primaryModel: e.primaryModel,
      fallbackChain: e.fallbackChain,
      temperature: Number(e.temperature),
      maxTokens: e.maxTokens,
    })),
  });
}
