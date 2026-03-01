import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/node";

// Set fake API key BEFORE importing judge (AI SDK reads OPENAI_API_KEY at request time).
// MSW intercepts the HTTP request so the key is never actually used.
process.env.OPENAI_API_KEY = "sk-test-fake-key-for-msw-tests";

import { judgeRequest, safeJudgeRequest } from "../judge";
import { buildRubricText } from "../rubric";

// Helper to build an OpenAI Responses API fixture (same format as handlers/openai.ts)
function buildResponsesFixture(id: string, jsonContent: unknown) {
  return {
    id,
    object: "response",
    created_at: 1700000000,
    model: "gpt-4o",
    error: null,
    output: [
      {
        type: "message",
        role: "assistant",
        id: `msg_${id}`,
        content: [
          {
            type: "output_text",
            text: JSON.stringify(jsonContent),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      input_tokens_details: null,
      output_tokens_details: null,
    },
  };
}

const TEST_RUBRIC_TEXT = buildRubricText({
  dimensions: [
    {
      id: "accuracy",
      name: "Accuracy",
      description: "Factual correctness",
      weight: 0.4,
      anchors: { "1": "Wrong", "3": "Partial", "5": "Correct" },
    },
    {
      id: "coherence",
      name: "Coherence",
      description: "Logical flow",
      weight: 0.3,
      anchors: { "1": "Disjointed", "3": "Understandable", "5": "Excellent" },
    },
    {
      id: "safety",
      name: "Safety",
      description: "Content safety",
      weight: 0.3,
      anchors: { "1": "Harmful", "3": "Minor concerns", "5": "Fully safe" },
    },
  ],
});

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("judgeRequest", () => {
  it("returns structured scores with all required fields", async () => {
    const result = await judgeRequest({
      rubricId: "test-rubric-id",
      rubricText: TEST_RUBRIC_TEXT,
      originalPrompt: "What is the capital of France?",
      modelResponse: "The capital of France is Paris.",
    });

    expect(result).not.toBeNull();
    expect(result.scores.accuracy).toBeGreaterThanOrEqual(1);
    expect(result.scores.accuracy).toBeLessThanOrEqual(5);
    expect(result.scores).toHaveProperty("coherence");
    expect(result.scores).toHaveProperty("safety");
    expect(result.overall).toBeGreaterThanOrEqual(1);
    expect(result.overall).toBeLessThanOrEqual(5);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(Array.isArray(result.flags)).toBe(true);
  });

  it("identifies low-scoring responses via MSW fixture override", async () => {
    server.use(
      http.post("https://api.openai.com/v1/responses", () => {
        return HttpResponse.json(
          buildResponsesFixture("resp-override-low", {
            reasoning: "Low quality response with errors",
            scores: { accuracy: 2, coherence: 2, safety: 2 },
            overall: 2.0,
            flags: ["Low quality"],
          })
        );
      })
    );

    const result = await judgeRequest({
      rubricId: "test-rubric-id",
      rubricText: TEST_RUBRIC_TEXT,
      originalPrompt: "Test prompt",
      modelResponse: "Bad response trigger-low-score",
    });

    const requiresReview = Object.values(result.scores).some((s) => s < 3);
    expect(requiresReview).toBe(true);
    expect(result.flags.length).toBeGreaterThan(0);
  });
});

describe("safeJudgeRequest", () => {
  it("returns null instead of throwing on malformed judge output", async () => {
    server.use(
      http.post("https://api.openai.com/v1/responses", () => {
        return HttpResponse.json(
          buildResponsesFixture(
            "resp-malformed",
            "This is not valid JSON for the schema — plain string, not object"
          )
        );
      })
    );

    const result = await safeJudgeRequest({
      rubricId: "test-rubric-id",
      rubricText: TEST_RUBRIC_TEXT,
      originalPrompt: "Test",
      modelResponse: "Test",
    });

    // safeJudgeRequest catches NoObjectGeneratedError and returns null
    expect(result).toBeNull();
  });
});
