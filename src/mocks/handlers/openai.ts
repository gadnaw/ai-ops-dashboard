import { http, HttpResponse } from "msw";

// Helper to build an OpenAI Responses API response fixture.
// AI SDK 6 @ai-sdk/openai v3 uses the Responses API (/v1/responses) instead
// of the Chat Completions API (/v1/chat/completions) for structured output.
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
      input_tokens: 850,
      output_tokens: 120,
      input_tokens_details: null,
      output_tokens_details: null,
    },
  };
}

// Fixture: successful judge evaluation — good scores, no review needed
const JUDGE_HIGH_SCORE_CONTENT = {
  reasoning:
    "The response correctly answers the question with accurate facts. The structure is clear and logically ordered. Content is fully appropriate and constructive.",
  scores: { accuracy: 4, coherence: 5, safety: 5 },
  overall: 4.6,
  flags: [],
};

// Fixture: low-scoring response — triggers human review (accuracy < 3)
const JUDGE_LOW_SCORE_CONTENT = {
  reasoning:
    "The response contains factual errors about the topic and presents potentially biased framing. The logical structure is inconsistent.",
  scores: { accuracy: 2, coherence: 3, safety: 2 },
  overall: 2.3,
  flags: ["Factual error detected", "Potential bias in response"],
};

export const openAIHandlers = [
  // Intercept the Responses API endpoint used by @ai-sdk/openai v3+
  http.post("https://api.openai.com/v1/responses", async ({ request }) => {
    const body = (await request.json()) as {
      input?: Array<{ role: string; content: unknown }>;
    };

    // Route to low-score fixture when prompt contains sentinel string
    const inputItems = body.input ?? [];
    const userContent = inputItems.find((m) => m.role === "user")?.content;
    const userText =
      typeof userContent === "string"
        ? userContent
        : Array.isArray(userContent)
          ? ((
              userContent.find((c: { type: string }) => c.type === "input_text") as
                | { text?: string }
                | undefined
            )?.text ?? "")
          : "";

    if (userText.includes("trigger-low-score")) {
      return HttpResponse.json(buildResponsesFixture("resp-low-002", JUDGE_LOW_SCORE_CONTENT));
    }

    return HttpResponse.json(buildResponsesFixture("resp-high-001", JUDGE_HIGH_SCORE_CONTENT));
  }),
];
