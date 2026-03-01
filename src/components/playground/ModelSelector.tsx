"use client";

// Available models from the Phase 2 provider registry.
// Model IDs format: "provider:model-name" — passed directly to registry.languageModel()
// DO NOT add new models here without updating cost_rate_cards and the provider registry.
const AVAILABLE_MODELS = [
  // OpenAI
  { id: "openai:gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { id: "openai:gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  // Anthropic
  {
    id: "anthropic:claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet",
    provider: "Anthropic",
  },
  {
    id: "anthropic:claude-3-5-haiku-20241022",
    label: "Claude 3.5 Haiku",
    provider: "Anthropic",
  },
  // Google
  { id: "google:gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { id: "google:gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google" },
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number]["id"];

interface ModelSelectorProps {
  value: ModelId;
  onChange: (modelId: ModelId) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled = false }: ModelSelectorProps) {
  // Group by provider for the optgroup layout
  const providers = Array.from(new Set(AVAILABLE_MODELS.map((m) => m.provider)));

  return (
    <div>
      <label className="mb-1 block text-xs text-gray-400">Model</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ModelId)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        {providers.map((provider) => (
          <optgroup key={provider} label={provider} className="text-gray-400">
            {AVAILABLE_MODELS.filter((m) => m.provider === provider).map((model) => (
              <option key={model.id} value={model.id} className="bg-gray-800 text-white">
                {model.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export { AVAILABLE_MODELS };
