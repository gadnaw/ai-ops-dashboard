import { after } from "next/server";
import { loadEndpointConfig, streamWithFallback } from "@/lib/model-router/router";
import { logRequest } from "@/lib/logging/request-logger";
import { getErrorCode, isRetryableError } from "@/lib/model-router/errors";
import { MODEL_PROVIDERS } from "@/lib/model-router/types";
import { getVersion } from "@/lib/prompts/queries";
import { prisma } from "@/lib/db/prisma";
import { getRateLimiter, runDegradationChain, setCachedResponse } from "@/lib/rate-limiter";
import { getActiveExperiment, runExperiment } from "@/lib/ab-testing/experiment-runner";
import { maybeQueueEvaluation } from "@/lib/evaluator/trigger";
import type { NextRequest } from "next/server";

export const runtime = "nodejs"; // after() requires Node.js runtime (not Edge)

interface ChatRequestBody {
  endpoint?: string; // endpoint name for config lookup (e.g. 'summarization')
  prompt: string; // user message
  systemPrompt?: string; // optional override for system prompt
  sessionId?: string; // optional session tracking (COMP-01 deferred)
  // Phase 3: version-aware playground routing
  promptVersionId?: string; // prompt_versions.id — when present, use version content as system prompt
  modelId?: string; // registry model ID override e.g. 'openai:gpt-4o' (for playground)
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

  // ---------------------------------------------------------------------------
  // Phase 3: Resolve prompt version — when promptVersionId is provided,
  // use that version's content as the system prompt (playground mode).
  // This takes precedence over both body.systemPrompt and endpoint config.
  // ---------------------------------------------------------------------------
  let resolvedSystemPrompt: string | undefined = body.systemPrompt;
  let resolvedPromptVersionId: string | undefined;

  if (body.promptVersionId) {
    try {
      const version = await getVersion(body.promptVersionId);
      if (!version) {
        return Response.json(
          { error: `Prompt version ${body.promptVersionId} not found` },
          { status: 404 }
        );
      }
      // Use the version's system_prompt if set, otherwise use its content as system prompt
      resolvedSystemPrompt = version.systemPrompt ?? version.content;
      resolvedPromptVersionId = version.id;
    } catch {
      return Response.json({ error: "Failed to load prompt version" }, { status: 500 });
    }
  }

  // Load endpoint config (primary model + fallback chain + temperature/maxTokens/systemPrompt)
  let config;
  try {
    config = await loadEndpointConfig(endpointName);
  } catch {
    return Response.json({ error: "Failed to load endpoint config" }, { status: 500 });
  }

  // Phase 3: modelId override for playground — replace primary model in config
  // while preserving the fallback chain for reliability
  if (body.modelId) {
    config = {
      ...config,
      models: [body.modelId, ...config.models.slice(1)],
    };
  }

  // effectiveModelId: resolved primary model for this request (let — Stage 2 may override)
  let effectiveModelId = config.models[0] ?? "openai:gpt-4o";

  // ── Phase 4: Degradation chain integration ─────────────────────────────────
  // Extract API key from Authorization header for rate limit identification.
  // Format: "Bearer sk-..." — we SHA-256 hash the raw key to look up api_keys.
  // For requests without an API key, skip rate limiting (dashboard demo traffic).
  const authHeader = request.headers.get("Authorization");
  const apiKeyRaw = authHeader?.replace("Bearer ", "").trim();

  if (apiKeyRaw) {
    const { createHash } = await import("crypto");
    const keyHash = createHash("sha256").update(apiKeyRaw).digest("hex");
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { keyHash },
      select: { id: true },
    });

    if (apiKeyRecord) {
      const degradation = await runDegradationChain(
        apiKeyRecord.id,
        body.prompt,
        effectiveModelId,
        getRateLimiter()
      );

      if (degradation.action === "reject") {
        return new Response(
          JSON.stringify({
            error: "rate_limit_exceeded",
            message: "All degradation stages exhausted. Retry after indicated delay.",
            retry_after: degradation.retryAfterSec,
            stages_traversed: degradation.stagesTraversed,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(degradation.retryAfterSec ?? 60),
              "X-RateLimit-Limit": String(60),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(
                Math.floor(Date.now() / 1000) + (degradation.retryAfterSec ?? 60)
              ),
              "X-Degradation-Stages": degradation.stagesTraversed.join(","),
            },
          }
        );
      }

      if (degradation.action === "cached") {
        // Return cached response — skip LLM call entirely
        return new Response(
          JSON.stringify({
            text: degradation.cachedResponse,
            cached: true,
            stages_traversed: degradation.stagesTraversed,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "X-Served-From": "cache",
              "X-Cache-Hit": "true",
              "X-Degradation-Stages": degradation.stagesTraversed.join(","),
            },
          }
        );
      }

      // degradation.action === 'proceed'
      // Use degradation.model if Stage 2 assigned a fallback model
      if (degradation.model && degradation.model !== effectiveModelId) {
        effectiveModelId = degradation.model;
        config = {
          ...config,
          models: [effectiveModelId, ...config.models.slice(1)],
        };
      }
    }
  }
  // ── End Phase 4 degradation chain ─────────────────────────────────────────

  let usedModel = effectiveModelId;
  let fallbackCount = 0;
  let fallbackReason: string | undefined;
  let streamResult;

  try {
    const result = await streamWithFallback(
      config,
      {
        prompt: body.prompt,
        ...(resolvedSystemPrompt ? { systemPrompt: resolvedSystemPrompt } : {}),
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
          ...(resolvedPromptVersionId ? { promptVersionId: resolvedPromptVersionId } : {}),
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
        // Phase 3: log which prompt version was used for analytics
        ...(resolvedPromptVersionId ? { promptVersionId: resolvedPromptVersionId } : {}),
      });

      // H10: Populate response_cache for Stage 3 degradation (Phase 4 cross-phase scope).
      // Cache every successful LLM response so degraded requests can be served from cache.
      try {
        if (body.prompt && responseText && usedModel) {
          await setCachedResponse(body.prompt, usedModel, responseText, {
            ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
            ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
          });
        }
      } catch (cacheErr) {
        // Cache write failure must never propagate
        console.error("[after] response_cache write failed (non-fatal):", cacheErr);
      }

      // Phase 4: A/B experiment metrics — record observation if request used a prompt version
      try {
        if (resolvedPromptVersionId) {
          const experiment = await getActiveExperiment(resolvedPromptVersionId);
          if (experiment) {
            const durationMs = Date.now() - startTime;
            const costUsd = Number(
              (
                await prisma.requestLog.findFirst({
                  where: { id: requestId },
                  select: { costUsd: true },
                })
              )?.costUsd ?? 0
            );
            await runExperiment(experiment.id, requestId, durationMs, costUsd, false);
          }
        }
      } catch (abErr) {
        console.error("[after] A/B experiment recording failed (non-fatal):", abErr);
      }

      // Phase 5: Queue evaluation at 10% sampling rate (deterministic FNV-1a)
      // Analysis constraint M11: same requestId always evaluates or always skips
      try {
        await maybeQueueEvaluation(requestId, 0.1);
      } catch (evalErr) {
        console.error("[after] maybeQueueEvaluation failed (non-fatal):", evalErr);
      }
    } catch (logError) {
      // Logging failure must NEVER propagate — response already sent
      console.error("[after] request logging failed:", logError);
    }
  });

  // H4: toTextStreamResponse() — compatible with useCompletion({ streamProtocol: 'text' }).
  // PlaygroundForm uses streamProtocol: 'text' so we return a plain text stream here.
  return streamResult.toTextStreamResponse();
}
