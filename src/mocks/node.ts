import { setupServer } from "msw/node";
import { openAIHandlers } from "./handlers/openai";

export const server = setupServer(...openAIHandlers);
