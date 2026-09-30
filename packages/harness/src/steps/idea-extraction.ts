import { INTEGRATIONS } from "@ideaforge/scoring";
import { z } from "zod";

import type { StepDefinition } from "../step.js";

const DELIVERY_MODELS = [
  "SELF_SERVE_SAAS",
  "DONE_FOR_YOU_SERVICE",
  "MARKETPLACE_TAKE_RATE",
  "ONE_TIME_PURCHASE",
] as const;

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

const complexityExtractionSchema = z.object({
  integrations: z.array(z.enum(INTEGRATIONS)).max(10),
  requiresRealtime: z.boolean(),
  requiresMobileApp: z.boolean(),
  requiresRegulatedData: z.boolean(),
  requiresMLModel: z.boolean(),
  requiresTwoSidedMarketplace: z.boolean(),
});

export const ideaExtractionSchema = z.object({
  coreKeywords: z.array(z.string().min(1)).min(1).max(3),
  themeVocab: z.array(z.string().regex(SNAKE_CASE)).min(1).max(6),
  featureVocab: z.array(z.string().regex(SNAKE_CASE)).min(1).max(8),
  complexity: complexityExtractionSchema,
  deliveryModel: z.enum(DELIVERY_MODELS),
});

export type IdeaExtraction = z.infer<typeof ideaExtractionSchema>;

export interface IdeaExtractionInput {
  readonly statement: string;
}

const jsonSchema = {
  type: "object",
  required: ["coreKeywords", "themeVocab", "featureVocab", "complexity", "deliveryModel"],
  properties: {
    coreKeywords: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
    themeVocab: {
      type: "array",
      items: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
      minItems: 1,
      maxItems: 6,
      description: "snake_case pain-theme tags this idea's problem space could cluster into",
    },
    featureVocab: {
      type: "array",
      items: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
      minItems: 1,
      maxItems: 8,
      description: "snake_case candidate feature tags a product in this space would have",
    },
    complexity: {
      type: "object",
      required: [
        "integrations",
        "requiresRealtime",
        "requiresMobileApp",
        "requiresRegulatedData",
        "requiresMLModel",
        "requiresTwoSidedMarketplace",
      ],
      properties: {
        integrations: { type: "array", items: { type: "string", enum: [...INTEGRATIONS] } },
        requiresRealtime: { type: "boolean" },
        requiresMobileApp: { type: "boolean" },
        requiresRegulatedData: { type: "boolean" },
        requiresMLModel: { type: "boolean" },
        requiresTwoSidedMarketplace: { type: "boolean" },
      },
    },
    deliveryModel: { type: "string", enum: [...DELIVERY_MODELS] },
  },
} as const;

/**
 * Idea-level extraction: runs once per idea, before any collection, so `coreKeywords` can seed the
 * Reddit/GitHub queries. `themeVocab` and `featureVocab` are generated from the idea statement alone
 * for v0 — nora's spec (§8.3, §9.3) refines them with the top 2 competitor descriptions once
 * competitors are known; that two-phase refinement is deferred (see PR description).
 */
export const ideaExtractionStep: StepDefinition<IdeaExtractionInput, IdeaExtraction> = {
  id: "extract-idea-signals",
  promptVersion: 1,
  schema: ideaExtractionSchema,
  jsonSchema,
  buildPrompt(input) {
    return [
      "You are extracting structured facts from a business idea statement for IdeaForge.",
      "Never invent numbers or ratings — only fill the fixed fields below from what the statement literally implies.",
      "",
      `Idea statement: "${input.statement}"`,
      "",
      "Fields:",
      "- coreKeywords: up to 3 short search keywords for finding Reddit discussion and GitHub competitors.",
      '- themeVocab: up to 6 snake_case tags for the pain themes this idea could address (include "other" as a catch-all).',
      "- featureVocab: up to 8 snake_case tags for the product features a solution in this space would have.",
      "- complexity.integrations: pick only from the fixed vocabulary — never invent a new integration name.",
      "- complexity.requiresMLModel means a custom-trained model, not calling an LLM API.",
      "- deliveryModel: pick the single best fit for how this idea would charge money.",
    ].join("\n");
  },
};
