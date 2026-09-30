import type { ComplexityExtraction, Tier } from "./types.js";

/** Formulas and constants are the literal spec from nora's `plan` document, §4. */
export const BASE_COMPLEXITY = 10;
export const INTEGRATION_POINTS = 8;
export const INTEGRATION_CAP = 5;
export const REALTIME_POINTS = 15;
export const MOBILE_POINTS = 15;
export const REGULATED_DATA_POINTS = 25;
export const ML_MODEL_POINTS = 20;
export const MARKETPLACE_POINTS = 20;
export const MIN_IDEA_WORDS = 25;

export function complexityScore(x: ComplexityExtraction): number {
  const raw =
    BASE_COMPLEXITY +
    Math.min(x.integrations.length, INTEGRATION_CAP) * INTEGRATION_POINTS +
    (x.requiresRealtime ? REALTIME_POINTS : 0) +
    (x.requiresMobileApp ? MOBILE_POINTS : 0) +
    (x.requiresRegulatedData ? REGULATED_DATA_POINTS : 0) +
    (x.requiresMLModel ? ML_MODEL_POINTS : 0) +
    (x.requiresTwoSidedMarketplace ? MARKETPLACE_POINTS : 0);
  return Math.min(raw, 100);
}

export function complexityConfidence(ideaWordCount: number, x: ComplexityExtraction): Tier {
  if (ideaWordCount < MIN_IDEA_WORDS) return "low";
  const hasSignal =
    x.integrations.length > 0 ||
    x.requiresRealtime ||
    x.requiresMobileApp ||
    x.requiresRegulatedData ||
    x.requiresMLModel ||
    x.requiresTwoSidedMarketplace;
  return hasSignal ? "high" : "medium"; // meets length bar but genuinely looks simple
}
