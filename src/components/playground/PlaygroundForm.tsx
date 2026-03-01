"use client";

import { useCompletion } from "@ai-sdk/react";
import { useState, useCallback } from "react";
import { TokenCounter } from "./TokenCounter";
import { ModelSelector } from "./ModelSelector";
import type { ModelId } from "./ModelSelector";
import { PromptVersionPicker } from "./PromptVersionPicker";
import { PromptEditor } from "@/components/prompts/PromptEditor";
import { interpolateVariables } from "@/lib/prompts/variables";

type PromptVersion = {
  id: string;
  version: number;
  content: string;
  systemPrompt: string | null;
  variables: unknown;
};

type PromptTemplate = {
  id: string;
  slug: string;
  name: string;
  activeVersionId: string | null;
  versions: PromptVersion[];
};

interface PlaygroundFormProps {
  templates: PromptTemplate[];
  initialVersionId?: string;
}

export function PlaygroundForm({ templates, initialVersionId }: PlaygroundFormProps) {
  // Model and parameter state
  const [modelId, setModelId] = useState<ModelId>("openai:gpt-4o-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  // Prompt version state
  const [selectedVersion, setSelectedVersion] = useState<PromptVersion | null>(null);
  const [freeFormPrompt, setFreeFormPrompt] = useState("");

  // Variable values (for when a versioned template is selected)
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Reset variable values when version changes
  const handleVersionSelect = useCallback((version: PromptVersion | null) => {
    setSelectedVersion(version);
    if (version && Array.isArray(version.variables)) {
      // Initialize all variables to empty strings
      setVariableValues(Object.fromEntries((version.variables as string[]).map((v) => [v, ""])));
    } else {
      setVariableValues({});
    }
  }, []);

  // useCompletion: single-turn playground hook
  // Sends POST to /api/v1/chat with { prompt, ...body }
  // streamProtocol defaults to 'data' — compatible with toUIMessageStreamResponse()
  const { completion, complete, isLoading, error, stop } = useCompletion({
    api: "/api/v1/chat",
    // Default streamProtocol: 'data' — matches toUIMessageStreamResponse() on the server.
    // The /api/v1/chat route uses toUIMessageStreamResponse() (verified in route.ts line 166).
    streamProtocol: "text",

    onFinish: (_prompt: string, _completion: string) => {
      // Client-side finish callback — exact token counts are server-side only.
      // The dashboard request log will show the authoritative count from usage.inputTokens.
    },

    onError: (err: Error) => {
      console.error("[Playground] Stream error:", err.message);
    },
  });

  const handleRun = () => {
    // Determine the prompt to send
    let promptText: string;

    if (selectedVersion) {
      // Interpolate {{variables}} with user-provided values
      promptText = interpolateVariables(selectedVersion.content, variableValues);
    } else {
      promptText = freeFormPrompt;
    }

    if (!promptText.trim()) return;

    // complete() sends: POST /api/v1/chat with body = { prompt: promptText, ...additionalBody }
    void complete(promptText, {
      body: {
        ...(selectedVersion?.id ? { promptVersionId: selectedVersion.id } : {}),
        modelId,
        modelConfig: {
          temperature,
          maxTokens,
          // systemPrompt from version is resolved server-side via promptVersionId
        },
      },
    });
  };

  const variables =
    selectedVersion && Array.isArray(selectedVersion.variables)
      ? (selectedVersion.variables as string[])
      : [];

  // Full prompt text for token estimation (prompt + completion so far)
  const promptForCount = selectedVersion
    ? interpolateVariables(selectedVersion.content, variableValues)
    : freeFormPrompt;

  // Disable run if no prompt content available
  const canRun = selectedVersion ? true : freeFormPrompt.trim().length > 0;

  return (
    <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
      {/* LEFT PANEL: Configuration */}
      <div className="space-y-5">
        {/* Model selector */}
        <ModelSelector value={modelId} onChange={setModelId} disabled={isLoading} />

        {/* Prompt template picker */}
        <PromptVersionPicker
          templates={templates}
          onVersionSelect={handleVersionSelect}
          initialVersionId={initialVersionId}
        />

        {/* Variable inputs — shown when a versioned template is selected */}
        {variables.length > 0 && (
          <div className="space-y-2">
            <label className="block text-xs text-gray-400">Variable Values</label>
            {variables.map((varName) => (
              <div key={varName}>
                <label className="mb-1 block font-mono text-xs text-amber-400/80">
                  {`{{${varName}}}`}
                </label>
                <input
                  type="text"
                  value={variableValues[varName] ?? ""}
                  onChange={(e) =>
                    setVariableValues((prev) => ({
                      ...prev,
                      [varName]: e.target.value,
                    }))
                  }
                  placeholder={`Value for {{${varName}}}`}
                  disabled={isLoading}
                  className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-1.5 font-mono text-sm text-white focus:border-amber-500 focus:outline-none disabled:opacity-50"
                />
              </div>
            ))}
          </div>
        )}

        {/* Prompt content — versioned (read-only) or free-form */}
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            {selectedVersion ? `Prompt Content — v${selectedVersion.version}` : "Prompt"}
          </label>
          {selectedVersion ? (
            // Show version content in read-only editor with variable highlighting
            <PromptEditor value={selectedVersion.content} readOnly height="200px" />
          ) : (
            <textarea
              value={freeFormPrompt}
              onChange={(e) => setFreeFormPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              rows={8}
              disabled={isLoading}
              className="w-full resize-none rounded-md border border-gray-600 bg-gray-800 px-3 py-2 font-mono text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          )}
        </div>

        {/* Parameters */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Temperature: <span className="font-mono text-white">{temperature}</span>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={isLoading}
              className="w-full accent-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Max Tokens: <span className="font-mono text-white">{maxTokens}</span>
            </label>
            <input
              type="range"
              min="64"
              max="4096"
              step="64"
              value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              disabled={isLoading}
              className="w-full accent-blue-500"
            />
          </div>
        </div>

        {/* Run / Stop button */}
        <div className="flex items-center gap-3">
          {!isLoading ? (
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Run
            </button>
          ) : (
            <button
              onClick={() => stop()}
              className="rounded-md bg-red-700 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              Stop
            </button>
          )}

          {/* Live token counter */}
          <TokenCounter text={completion} isStreaming={isLoading} promptText={promptForCount} />
        </div>

        {/* Error display */}
        {error && !isLoading && (
          <div className="rounded-md border border-red-700/50 bg-red-900/30 p-3">
            <p className="text-sm text-red-400">{error.message}</p>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: Streaming output */}
      <div className="flex flex-col">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs text-gray-400">Response</label>
          {completion && !isLoading && <span className="text-xs text-green-400">Complete</span>}
          {isLoading && <span className="animate-pulse text-xs text-blue-400">Streaming...</span>}
        </div>

        <div className="min-h-[400px] flex-1 overflow-auto rounded-lg border border-gray-700 bg-gray-950 p-4">
          {completion ? (
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-gray-200">
              {completion}
              {isLoading && (
                <span className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-blue-400 align-middle" />
              )}
            </pre>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-600">
                {isLoading ? "Waiting for first token..." : "Response will appear here"}
              </p>
            </div>
          )}
        </div>

        {/* Post-run metadata */}
        {completion && !isLoading && (
          <div className="mt-3 space-y-1 rounded-md border border-gray-700/50 bg-gray-800/50 p-3 text-xs text-gray-500">
            <p>
              Model: <span className="font-mono text-gray-300">{modelId}</span>
            </p>
            {selectedVersion && (
              <p>
                Version:{" "}
                <span className="font-mono text-gray-300">
                  v{selectedVersion.version} ({selectedVersion.id.slice(0, 8)}...)
                </span>
              </p>
            )}
            <p className="text-green-600/60">
              Request logged to dashboard — check Request Logs for full metrics.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
