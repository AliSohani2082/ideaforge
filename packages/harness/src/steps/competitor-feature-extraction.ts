import { z } from "zod";

import type { StepDefinition } from "../step.js";

const qualityFlagSchema = z.enum(["GOOD", "BASIC", "POOR", "UNKNOWN"]);

const featureRowSchema = z
  .object({
    featureTag: z.string(),
    present: z.boolean(),
    qualityFlag: qualityFlagSchema,
    evidenceQuote: z.string().optional().default(""),
  })
  // Every claim must be auditable back to a specific sentence — if no quote was given, the schema
  // itself forces the quality flag down to UNKNOWN rather than trusting an unsupported rating (§9.3).
  .transform((row) => (row.evidenceQuote.trim().length === 0 ? { ...row, qualityFlag: "UNKNOWN" as const } : row));

const competitorExtractionSchema = z.object({
  repoId: z.string(),
  competitorType: z.enum(["DIRECT", "ADJACENT"]),
  features: z.array(featureRowSchema),
});

export type CompetitorExtraction = z.infer<typeof competitorExtractionSchema>;

export const competitorFeatureExtractionSchema = z.array(competitorExtractionSchema);

export interface CompetitorFeatureExtractionInput {
  readonly ideaStatement: string;
  readonly featureVocab: readonly string[];
  readonly repos: ReadonlyArray<{
    readonly repoId: string;
    readonly fullName: string;
    readonly description: string;
    readonly topics: readonly string[];
  }>;
}

const jsonSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["repoId", "competitorType", "features"],
    properties: {
      repoId: { type: "string" },
      competitorType: {
        type: "string",
        enum: ["DIRECT", "ADJACENT"],
        description: "DIRECT if the repo's stated purpose substantially matches the idea; else ADJACENT",
      },
      features: {
        type: "array",
        items: {
          type: "object",
          required: ["featureTag", "present", "qualityFlag", "evidenceQuote"],
          properties: {
            featureTag: { type: "string", description: "one tag from the provided featureVocab" },
            present: { type: "boolean" },
            qualityFlag: { type: "string", enum: ["GOOD", "BASIC", "POOR", "UNKNOWN"] },
            evidenceQuote: {
              type: "string",
              description: "a literal substring from the repo description/README supporting the flag, or empty",
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Batched competitor/feature extraction over GitHub search results (nora's spec §9.1, §9.3): one
 * call classifies every candidate repo and fills the feature matrix in a single structured array.
 */
export const competitorFeatureExtractionStep: StepDefinition<
  CompetitorFeatureExtractionInput,
  CompetitorExtraction[]
> = {
  id: "extract-competitor-features",
  promptVersion: 1,
  schema: competitorFeatureExtractionSchema,
  jsonSchema,
  buildPrompt(input) {
    const reposBlock = input.repos
      .map(
        (r) =>
          `- repoId=${r.repoId}\n  name: ${r.fullName}\n  description: ${r.description}\n  topics: ${r.topics.join(", ")}`,
      )
      .join("\n");
    return [
      "You are classifying GitHub repositories as competitors to a business idea for IdeaForge.",
      `Idea statement: "${input.ideaStatement}"`,
      `Feature vocabulary (use only these tags, one row per feature the repo could plausibly have): ${input.featureVocab.join(", ")}`,
      "",
      "For each repo, decide:",
      "- competitorType: DIRECT if its stated purpose substantially matches the idea's problem; ADJACENT if it solves a broader problem and this is one feature.",
      "- For each feature tag: present (does the repo appear to have it, from the description/topics?), qualityFlag (GOOD/BASIC/POOR/UNKNOWN),",
      "  and evidenceQuote — a literal short substring from the description that supports your flag. Leave evidenceQuote empty if you cannot quote one; do not fabricate a quote.",
      "",
      "Repos:",
      reposBlock,
      "",
      "Return one object per repo, in the same order, covering every repoId exactly once.",
    ].join("\n");
  },
};
