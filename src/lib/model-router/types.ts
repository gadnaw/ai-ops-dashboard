// Model IDs supported by the registry (matches cost_rate_cards.model_id)
export type ModelId =
  | "openai:gpt-4o"
  | "openai:gpt-4o-mini"
  | "anthropic:claude-3-5-sonnet-20241022"
  | "anthropic:claude-3-5-haiku-20241022"
  | "google:gemini-2.5-flash"
  | "google:gemini-2.0-flash";

export const MODEL_PROVIDERS: Record<string, string> = {
  "openai:gpt-4o": "openai",
  "openai:gpt-4o-mini": "openai",
  "anthropic:claude-3-5-sonnet-20241022": "anthropic",
  "anthropic:claude-3-5-haiku-20241022": "anthropic",
  "google:gemini-2.5-flash": "google",
  "google:gemini-2.0-flash": "google",
};

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "openai:gpt-4o": "GPT-4o",
  "openai:gpt-4o-mini": "GPT-4o Mini",
  "anthropic:claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "anthropic:claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
  "google:gemini-2.5-flash": "Gemini 2.5 Flash",
  "google:gemini-2.0-flash": "Gemini 2.0 Flash",
};

export interface FallbackChainConfig {
  endpointName: string;
  models: string[]; // Ordered fallback chain — index 0 is primary
  temperature: number;
  maxTokens: number;
  systemPrompt?: string;
}

export interface RouterResult {
  usedModel: string; // Which model actually served the response
  fallbackCount: number; // 0 = primary, 1+ = fallback index
  fallbackReason?: string; // Error message from skipped models
}
