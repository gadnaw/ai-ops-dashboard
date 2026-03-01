import { prisma } from "@/lib/db/prisma";
import { calculateCost } from "@/lib/cost/calculator";

export interface LogRequestInput {
  requestId: string;
  endpointName?: string;
  usedModel: string; // e.g. 'openai:gpt-4o'
  provider: string; // e.g. 'openai'
  // H3: AI SDK 6 token property names are inputTokens/outputTokens (NOT promptTokens/completionTokens)
  inputTokens: number; // from usage.inputTokens
  outputTokens: number; // from usage.outputTokens
  cachedTokens?: number; // from usage.cachedTokens (Anthropic prompt cache hit)
  durationMs: number;
  status: "success" | "error";
  errorCode?: string; // 'rate_limit' | 'timeout' | 'model_error'
  isFallback: boolean;
  fallbackReason?: string;
  promptText?: string; // H5: log prompt text when available
  responseText?: string; // H5: log response text when available
  promptVersionId?: string; // H12: nullable, no FK constraint in Phase 2
  sessionId?: string;
}

export async function logRequest(input: LogRequestInput): Promise<void> {
  // Calculate cost from rate cards (does not throw — returns 0 on failure)
  const { costUsd } = await calculateCost({
    modelId: input.usedModel,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedTokens: input.cachedTokens ?? 0,
  });

  // Write to request_logs (partitioned table — Prisma routes to correct partition automatically)
  // Use null for optional string fields — Prisma exactOptionalPropertyTypes requires null, not undefined
  await prisma.requestLog.create({
    data: {
      id: input.requestId,
      provider: input.provider,
      model: input.usedModel,
      endpoint: input.endpointName ?? null,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      cachedTokens: input.cachedTokens ?? 0,
      costUsd,
      durationMs: input.durationMs,
      status: input.status,
      errorCode: input.errorCode ?? null,
      isFallback: input.isFallback,
      fallbackReason: input.fallbackReason ?? null,
      promptText: input.promptText ?? null,
      responseText: input.responseText ?? null,
      promptVersionId: input.promptVersionId ?? null,
      sessionId: input.sessionId ?? null,
    },
  });

  // Insert DashboardEvent for Realtime notification on fallback events
  // This allows the dashboard to show fallback events in near-real-time (<30s, per success criteria)
  if (input.isFallback) {
    await prisma.dashboardEvent.create({
      data: {
        eventType: "fallback_occurred",
        payload: {
          model: input.usedModel,
          fallbackReason: input.fallbackReason ?? null,
          requestId: input.requestId,
        },
      },
    });
  }
}
