import { after } from "next/server";
import { loadEndpointConfig, streamWithFallback } from "@/lib/model-router/router";
import { logRequest } from "@/lib/logging/request-logger";
import { getErrorCode, isRetryableError } from "@/lib/model-router/errors";
import { MODEL_PROVIDERS } from "@/lib/model-router/types";
import type { NextRequest } from "next/server";

export const runtime = "nodejs"; // after() requires Node.js runtime (not Edge)

interface ChatRequestBody {
  endpoint?: string; // endpoint name for config lookup (e.g. 'summarization')
  prompt: string; // user message
  systemPrompt?: string; // optional override for system prompt
  sessionId?: string; // optional session tracking (COMP-01 deferred)
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.prompt?.trim()) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }

  const endpointName = body.endpoint ?? "chat";

  // Load endpoint config (primary model + fallback chain + temperature/maxTokens/systemPrompt)
  let config;
  try {
    config = await loadEndpointConfig(endpointName);
  } catch {
    return Response.json({ error: "Failed to load endpoint config" }, { status: 500 });
  }

  let usedModel = config.models[0] ?? "openai:gpt-4o";
  let fallbackCount = 0;
  let fallbackReason: string | undefined;
  let streamResult;

  try {
    const result = await streamWithFallback(
      config,
      {
        prompt: body.prompt,
        ...(body.systemPrompt ? { systemPrompt: body.systemPrompt } : {}),
      },
      // onFallback callback — called when a model fails and we try the next
      (from, _to, error) => {
        fallbackReason = `${from} failed: ${error.message}`;
      }
    );
    streamResult = result.stream;
    usedModel = result.usedModel;
    fallbackCount = result.fallbackCount;
    fallbackReason = result.fallbackReason;
  } catch (error) {
    // All models in chain failed — log the failure and return error
    const durationMs = Date.now() - startTime;

    after(async () => {
      try {
        await logRequest({
          requestId,
          endpointName,
          usedModel,
          provider: MODEL_PROVIDERS[usedModel] ?? "unknown",
          inputTokens: 0,
          outputTokens: 0,
          durationMs,
          status: "error",
          errorCode: getErrorCode(error),
          isFallback: false,
          promptText: body.prompt,
          ...(body.sessionId ? { sessionId: body.sessionId } : {}),
        });
      } catch (logError) {
        console.error("[after] error logging failed:", logError);
      }
    });

    const statusCode = isRetryableError(error) ? 503 : 500;
    return Response.json({ error: "All models failed", requestId }, { status: statusCode });
  }

  // Fire-and-forget logging — runs AFTER response has been fully streamed to client.
  // after() is stable in Next.js 15.1.0+. Must use Node.js runtime (set above).
  // H3: Use usage.inputTokens and usage.outputTokens (NOT promptTokens/completionTokens)
  after(async () => {
    try {
      const usage = await streamResult.usage;
      const responseText = await Promise.resolve(streamResult.text).catch(() => undefined);

      await logRequest({
        requestId,
        endpointName,
        usedModel,
        provider: MODEL_PROVIDERS[usedModel] ?? "unknown",
        // H3: AI SDK 6 token property names — inputTokens/outputTokens may be undefined if stream fails
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        // cacheReadTokens from inputTokenDetails is the cached tokens count
        cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        durationMs: Date.now() - startTime,
        status: "success",
        isFallback: fallbackCount > 0,
        ...(fallbackReason ? { fallbackReason } : {}),
        promptText: body.prompt,
        ...(responseText ? { responseText } : {}),
        ...(body.sessionId ? { sessionId: body.sessionId } : {}),
      });
    } catch (logError) {
      // Logging failure must NEVER propagate — response already sent
      console.error("[after] request logging failed:", logError);
    }
  });

  // H4: toUIMessageStreamResponse() — verify compatibility with useCompletion in Phase 3.
  // For Phase 2, this is the correct streaming response method per AI SDK 6.
  return streamResult.toUIMessageStreamResponse();
}
