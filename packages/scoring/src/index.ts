/**
 * Scores are deterministic code, never model output — the same evidence always yields the same
 * score, and re-scoring cached evidence costs zero tokens. Every formula here is the literal spec
 * from nora's `plan` document on ALIA-3 ("IdeaForge Evaluation Methodology v0").
 */
export * from "./types.js";
export * from "./demand.js";
export * from "./competition.js";
export * from "./complexity.js";
export * from "./margin.js";
export * from "./readiness.js";
export * from "./verdict.js";
export * from "./edge.js";
