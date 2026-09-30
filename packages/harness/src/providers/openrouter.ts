import type { LlmProvider } from "../provider.js";
import { extractJson } from "./json-extract.js";

export interface OpenRouterProviderOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Optional metered fallback, read from env only — never commit a key, never log one. Used when the
 * owner doesn't have (or doesn't want to spend) Claude Code CLI availability for a given run.
 */
export function createOpenRouterProvider(options: OpenRouterProviderOptions = {}): LlmProvider {
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  const model = options.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  return {
    name: "openrouter",
    async complete(prompt, jsonSchema) {
      if (!apiKey) {
        throw new Error(
          "OPENROUTER_API_KEY is not set — the openrouter provider requires an API key from the environment.",
        );
      }
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: `${prompt}\n\nRespond with ONLY a single JSON value matching this JSON Schema:\n${JSON.stringify(jsonSchema)}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter request failed: ${res.status} ${await res.text()}`);
      }
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("OpenRouter response had no message content");
      }
      return extractJson(content);
    },
  };
}
