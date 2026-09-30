import { z } from "zod";

import type { StepDefinition } from "../step.js";

export const postTagSchema = z.object({
  postId: z.string(),
  topicMatch: z.boolean(),
  painThemeTag: z.string(), // validated against themeVocab downstream; falls back to "other" if not a member
  mentionsPaidWorkaround: z.boolean(),
});

export type PostTag = z.infer<typeof postTagSchema>;

export const painPointTaggingSchema = z.array(postTagSchema);

export interface PainPointTaggingInput {
  readonly themeVocab: readonly string[];
  readonly posts: ReadonlyArray<{ readonly postId: string; readonly title: string; readonly selftext: string }>;
}

const jsonSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["postId", "topicMatch", "painThemeTag", "mentionsPaidWorkaround"],
    properties: {
      postId: { type: "string" },
      topicMatch: {
        type: "boolean",
        description: "false if the post itself solicits business ideas rather than describing the author's own problem",
      },
      painThemeTag: { type: "string", description: "one tag from the provided themeVocab, or 'other'" },
      mentionsPaidWorkaround: { type: "boolean" },
    },
  },
} as const;

/**
 * Batched pain-point clustering extraction (nora's spec §8.3): one call tags every fetched post
 * against the idea's theme vocabulary in a single structured array, rather than one call per post —
 * fewer, larger calls at the same information content, which is the architecture's explicit cost
 * constraint. The output is semantically identical to "once per post" tagging.
 */
export const painPointTaggingStep: StepDefinition<PainPointTaggingInput, PostTag[]> = {
  id: "tag-reddit-posts",
  promptVersion: 1,
  schema: painPointTaggingSchema,
  jsonSchema,
  buildPrompt(input) {
    const postsBlock = input.posts
      .map((p) => `- postId=${p.postId}\n  title: ${p.title}\n  selftext: ${p.selftext.slice(0, 800)}`)
      .join("\n");
    return [
      "You are tagging Reddit posts for IdeaForge's pain-point clustering.",
      `Theme vocabulary (pick exactly one per post, or "other"): ${input.themeVocab.join(", ")}`,
      "",
      "For each post, decide:",
      "- topicMatch: true only if the post describes the AUTHOR'S OWN problem matching this idea's space.",
      '  Set false for "what should I build" / meta business-idea threads, or unrelated posts.',
      "- painThemeTag: the single best-fitting theme tag, or \"other\" if none fit.",
      "- mentionsPaidWorkaround: true if the author says they currently pay for a workaround/alternative.",
      "",
      "Posts:",
      postsBlock,
      "",
      "Return one object per post, in the same order, covering every postId exactly once.",
    ].join("\n");
  },
};
