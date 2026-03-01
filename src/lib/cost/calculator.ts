import { prisma } from "@/lib/db/prisma";

export interface CostInput {
  modelId: string; // registry ID e.g. 'openai:gpt-4o'
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number; // tokens served from cache (lower price)
}

export interface CostResult {
  costUsd: number;
  rateCardFound: boolean;
}

// Cache rate cards in module scope to avoid repeated DB queries per request.
// Rate cards change infrequently — 1-minute TTL is safe.
let rateCardCache: Map<
  string,
  {
    inputPrice: number;
    outputPrice: number;
    cachedInputPrice: number | null;
  }
> | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 1 minute

async function getRateCards() {
  if (rateCardCache && Date.now() < cacheExpiry) {
    return rateCardCache;
  }

  const cards = await prisma.costRateCard.findMany({
    where: { isActive: true },
    select: {
      modelId: true,
      inputPricePerMTokens: true,
      outputPricePerMTokens: true,
      cachedInputPricePerMTokens: true,
    },
  });

  rateCardCache = new Map(
    cards.map((c) => [
      c.modelId,
      {
        inputPrice: Number(c.inputPricePerMTokens),
        outputPrice: Number(c.outputPricePerMTokens),
        cachedInputPrice: c.cachedInputPricePerMTokens
          ? Number(c.cachedInputPricePerMTokens)
          : null,
      },
    ])
  );
  cacheExpiry = Date.now() + CACHE_TTL_MS;
  return rateCardCache;
}

// Calculate per-request cost from token counts.
// Returns 0 cost (not an error) if rate card is not found — allows logging to proceed.
export async function calculateCost(input: CostInput): Promise<CostResult> {
  try {
    const cards = await getRateCards();
    const card = cards.get(input.modelId);

    if (!card) {
      return { costUsd: 0, rateCardFound: false };
    }

    const cachedTokens = input.cachedTokens ?? 0;
    const regularInputTokens = Math.max(0, input.inputTokens - cachedTokens);

    // Cost = (regular_input * input_rate + cached_input * cached_rate + output * output_rate) / 1_000_000
    const cachedInputCost =
      cachedTokens > 0 && card.cachedInputPrice !== null
        ? (cachedTokens * card.cachedInputPrice) / 1_000_000
        : (cachedTokens * card.inputPrice) / 1_000_000; // fallback to full price if no cached rate

    const costUsd =
      (regularInputTokens * card.inputPrice) / 1_000_000 +
      cachedInputCost +
      (input.outputTokens * card.outputPrice) / 1_000_000;

    return { costUsd: Math.round(costUsd * 1e8) / 1e8, rateCardFound: true };
  } catch {
    // Calculator failure must not break the request path
    return { costUsd: 0, rateCardFound: false };
  }
}
