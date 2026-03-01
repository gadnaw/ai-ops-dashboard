import { AISDKError } from "ai";

// Determines if an error from streamText should trigger a provider fallback.
// Only 429 (rate limit) and 5xx (server errors) are retryable — 4xx client errors are not.
// AI_RetryError means the SDK already exhausted its own per-model retries.
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AISDKError) {
    // AI_APICallError wraps HTTP status codes from provider APIs
    const statusCode = (error as unknown as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number") {
      return statusCode === 429 || statusCode >= 500;
    }
  }
  // AI_RetryError: SDK exhausted maxRetries on same model — trigger our own fallback
  if (error instanceof Error) {
    return error.name === "AI_RetryError" || error.name === "AI_APICallError";
  }
  return false;
}

export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AISDKError) {
    const statusCode = (error as unknown as { statusCode?: number }).statusCode;
    return statusCode === 429;
  }
  return false;
}

export function getErrorCode(error: unknown): string {
  if (error instanceof AISDKError) {
    const statusCode = (error as unknown as { statusCode?: number }).statusCode;
    if (statusCode === 429) return "rate_limit";
    if (statusCode !== undefined && statusCode >= 500) return "model_error";
    if (statusCode === 408) return "timeout";
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("timeout")) return "timeout";
    if (error.name === "AI_RetryError") return "model_error";
  }
  return "model_error";
}
