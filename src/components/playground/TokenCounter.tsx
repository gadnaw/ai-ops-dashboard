"use client";

import { useMemo } from "react";
import { countTokens } from "gpt-tokenizer";

interface TokenCounterProps {
  /** The streaming or completed completion text */
  text: string;
  /** True while streaming — shows tilde prefix (~) to indicate estimate */
  isStreaming: boolean;
  /** The prompt text (included in total estimate) */
  promptText?: string;
}

/**
 * Live token counter using gpt-tokenizer (pure JS, browser-native).
 *
 * During streaming: shows "~N tokens" — client-side estimate using GPT-4o tokenizer.
 * The tilde prefix indicates this is an approximation (accurate for OpenAI,
 * ~10-15% off for Anthropic/Google which use different tokenizers).
 *
 * After streaming: removes tilde. Note: the server's usage.inputTokens +
 * usage.outputTokens is authoritative, but not surfaced to the client in this
 * implementation. The client estimate is sufficient for the playground UX.
 */
export function TokenCounter({ text, isStreaming, promptText = "" }: TokenCounterProps) {
  // useMemo avoids the setState-in-effect lint error and is more performant.
  // countTokens uses o200k_base encoding (GPT-4o tokenizer).
  // Accurate for OpenAI; approximate for Anthropic/Google which use different tokenizers.
  const tokenCount = useMemo(() => {
    if (!text && !promptText) return 0;
    try {
      return countTokens(promptText + text);
    } catch {
      // countTokens can fail on unusual Unicode — fallback: char/4
      return Math.ceil((promptText + text).length / 4);
    }
  }, [text, promptText]);

  if (tokenCount === 0 && !isStreaming) return null;

  return (
    <div className="flex items-center gap-1.5 font-mono text-xs text-gray-500">
      <span>{isStreaming ? `~${tokenCount}` : tokenCount}</span>
      <span>tokens</span>
      {isStreaming && (
        <span className="inline-block h-3 w-1.5 animate-pulse rounded-sm bg-gray-400" />
      )}
    </div>
  );
}
