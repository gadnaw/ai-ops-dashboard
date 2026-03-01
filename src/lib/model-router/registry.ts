// src/lib/model-router/registry.ts
// DO NOT import this file in Client Components — it references server-only env vars.
// This is a server-only module (no "use client" — placed in src/lib/).
import { createProviderRegistry } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

// createProviderRegistry namespaces providers so model IDs use 'provider:model' format.
// registry.languageModel('openai:gpt-4o')          → OpenAI GPT-4o
// registry.languageModel('anthropic:claude-3-5-sonnet-20241022') → Claude 3.5 Sonnet
// registry.languageModel('google:gemini-2.5-flash') → Gemini 2.5 Flash
//
// API keys are read from environment automatically by each provider package:
// - openai: OPENAI_API_KEY
// - anthropic: ANTHROPIC_API_KEY
// - google: GOOGLE_GENERATIVE_AI_API_KEY
export const registry = createProviderRegistry({
  openai,
  anthropic,
  google,
});
