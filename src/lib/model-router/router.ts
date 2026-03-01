import { streamText } from "ai";
import { registry } from "./registry";
import { isRetryableError } from "./errors";
import type { FallbackChainConfig, RouterResult } from "./types";
import { prisma } from "@/lib/db/prisma";

function jitter(baseMs: number): number {
  // Add 0-30% random jitter to avoid thundering herd
  return baseMs + Math.random() * baseMs * 0.3;
}

// Load endpoint config from database. Falls back to defaults if not found.
// Phase 4 will add caching here — for Phase 2 a single DB query per request is acceptable.
export async function loadEndpointConfig(endpointName: string): Promise<FallbackChainConfig> {
  const config = await prisma.endpointConfig.findUnique({
    where: { endpointName },
  });

  if (!config) {
    // Default fallback for unknown endpoints — uses gpt-4o as primary
    return {
      endpointName,
      models: ["openai:gpt-4o", "anthropic:claude-3-5-sonnet-20241022", "google:gemini-2.5-flash"],
      temperature: 0.7,
      maxTokens: 1000,
    };
  }

  return {
    endpointName: config.endpointName,
    models: [config.primaryModel, ...((config.fallbackChain as string[]) ?? [])],
    temperature: Number(config.temperature),
    maxTokens: config.maxTokens,
    ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
  };
}

interface StreamParams {
  prompt: string;
  systemPrompt?: string; // Override config system prompt if provided
}

interface StreamWithFallbackResult extends RouterResult {
  // The streamText result — caller returns result.toUIMessageStreamResponse()
  // Confirm toUIMessageStreamResponse() compatibility with useCompletion (H4) during Phase 3
  stream: ReturnType<typeof streamText>;
}

// Main entry point: tries models in order, falls back on 429/5xx with exponential backoff.
// Returns the stream result plus metadata about which model was used.
// Throws if ALL models in the chain fail.
export async function streamWithFallback(
  config: FallbackChainConfig,
  params: StreamParams,
  onFallback?: (from: string, to: string | undefined, error: Error) => void
): Promise<StreamWithFallbackResult> {
  let lastError: Error | undefined;
  let backoffMs = 500;

  for (let i = 0; i < config.models.length; i++) {
    const modelId = config.models[i]!;

    try {
      // Type assertion needed: registry.languageModel() has a strict union type,
      // but modelId is dynamically loaded from DB as string at runtime.
      const model = registry.languageModel(
        modelId as `openai:${string}` | `anthropic:${string}` | `google:${string}`
      );

      // maxRetries: 0 — we manage retries ourselves via the fallback loop.
      // SDK's built-in retry would retry the SAME model; we want cross-provider fallback.
      // AI SDK 6: maxOutputTokens (not maxTokens) per renamed parameter
      // exactOptionalPropertyTypes: system must not be passed as undefined — spread conditionally
      const resolvedSystem = params.systemPrompt ?? config.systemPrompt;
      const stream = streamText({
        model,
        prompt: params.prompt,
        ...(resolvedSystem ? { system: resolvedSystem } : {}),
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        maxRetries: 0,
      });

      return {
        stream,
        usedModel: modelId,
        fallbackCount: i,
        ...(lastError ? { fallbackReason: lastError.message } : {}),
      };
    } catch (error) {
      lastError = error as Error;

      if (!isRetryableError(error)) {
        // Non-retryable error (e.g. 400 Bad Request) — bubble up immediately, no fallback
        throw error;
      }

      onFallback?.(modelId, config.models[i + 1], lastError);

      if (i < config.models.length - 1) {
        // Wait before trying next model — exponential backoff with jitter
        await new Promise((resolve) => setTimeout(resolve, jitter(backoffMs)));
        backoffMs = Math.min(backoffMs * 2, 8000); // cap at 8 seconds
      }
    }
  }

  throw lastError ?? new Error("All models in fallback chain failed");
}
