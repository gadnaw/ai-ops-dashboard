"use client";

import { useState, useTransition } from "react";
import { updateEndpointConfig } from "@/app/(dashboard)/config/actions";

const AVAILABLE_MODELS = [
  "openai:gpt-4o",
  "openai:gpt-4o-mini",
  "anthropic:claude-3-5-sonnet-20241022",
  "anthropic:claude-3-5-haiku-20241022",
  "google:gemini-2.5-flash",
  "google:gemini-2.0-flash",
] as const;

interface EndpointConfigFormProps {
  config: {
    endpointName: string;
    primaryModel: string;
    fallbackChain: string[];
    temperature: number;
    maxTokens: number;
    systemPrompt: string | null;
  };
}

export function EndpointConfigForm({ config }: EndpointConfigFormProps) {
  const [temperature, setTemperature] = useState(config.temperature);
  const [maxTokens, setMaxTokens] = useState(config.maxTokens);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt ?? "");
  const [primaryModel, setPrimaryModel] = useState(config.primaryModel);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await updateEndpointConfig({
        endpointName: config.endpointName,
        temperature,
        maxTokens,
        systemPrompt: systemPrompt.trim() || null,
        primaryModel,
        fallbackChain: config.fallbackChain,
      });

      if ("error" in result) {
        setError(result.error);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Primary model selector */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Primary Model</label>
        <select
          value={primaryModel}
          onChange={(e) => setPrimaryModel(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
        >
          {AVAILABLE_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Temperature slider */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Temperature: <span className="font-mono text-gray-900">{temperature.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="w-full"
        />
        <div className="mt-0.5 flex justify-between text-xs text-gray-400">
          <span>0 (deterministic)</span>
          <span>2 (creative)</span>
        </div>
      </div>

      {/* Max tokens */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Max Tokens</label>
        <input
          type="number"
          min={1}
          max={100000}
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
        />
      </div>

      {/* System prompt */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">System Prompt</label>
        <textarea
          rows={3}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="Enter system prompt (optional)"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-gray-900 focus:outline-none"
        />
      </div>

      {error !== null && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-600">
          Configuration saved. Next request through this endpoint will use updated settings.
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {isPending ? "Saving..." : "Save Configuration"}
      </button>
    </form>
  );
}
