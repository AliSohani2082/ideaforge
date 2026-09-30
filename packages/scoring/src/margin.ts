import type { DeliveryModel, PricePoint, Tier } from "./types.js";

/** Formulas and constants are the literal spec from nora's `plan` document, §5. */
export const MARGIN_DEFAULT_NO_DATA = 40;
export const FREE_TIER_PENALTY = 0.85;
export const MARKETPLACE_FIXED_MIDPOINT = 55;

/**
 * Cost-to-serve is a stated ASSUMPTION TABLE, not a fetched number — the report must always show
 * these values alongside the score (nora's spec, §5).
 */
export function estimatedCostToServe(model: DeliveryModel, complexityScore: number): number {
  if (model === "DONE_FOR_YOU_SERVICE") return 35; // labor dominates, flat regardless of complexity
  if (model === "ONE_TIME_PURCHASE") return 0; // no recurring serving cost in this proxy — stated limitation
  if (model === "MARKETPLACE_TAKE_RATE") return NaN; // routed to the take-rate branch, not this formula
  // SELF_SERVE_SAAS:
  if (complexityScore < 40) return 1.5;
  if (complexityScore < 70) return 4;
  return 10;
}

export function marginScore(
  pricePoints: readonly PricePoint[],
  model: DeliveryModel,
  complexityScore: number,
): number {
  if (model === "MARKETPLACE_TAKE_RATE") {
    // Fixed midpoint assumed for a 10-20% take rate; always low-confidence (see marginConfidence).
    return MARKETPLACE_FIXED_MIDPOINT;
  }
  const paid = pricePoints
    .filter((p) => !p.isFreeTier && p.monthlyPriceUsd != null)
    .map((p) => p.monthlyPriceUsd!);
  if (paid.length === 0) return MARGIN_DEFAULT_NO_DATA;
  const sorted = paid.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const cost = estimatedCostToServe(model, complexityScore);
  const grossMarginProxy = Math.max(0, Math.min(1, (median - cost) / median));
  const hasFreeTier = pricePoints.some((p) => p.isFreeTier);
  return 100 * grossMarginProxy * (hasFreeTier ? FREE_TIER_PENALTY : 1);
}

export function marginConfidence(
  pricePoints: readonly PricePoint[],
  model: DeliveryModel,
): Tier {
  if (model === "MARKETPLACE_TAKE_RATE") return "low"; // forced — fixed-midpoint branch, never measured
  const paid = pricePoints.filter((p) => !p.isFreeTier && p.monthlyPriceUsd != null);
  if (paid.length === 0) return "low"; // forced
  const distinctPricedCompetitors = new Set(paid.map((p) => p.competitorId)).size;
  if (paid.length >= 3 && distinctPricedCompetitors >= 2) return "high";
  return "medium";
}
