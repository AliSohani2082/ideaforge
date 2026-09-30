import { ACTIVE_WINDOW_DAYS } from "./types.js";
import type { ScoredCompetitor, Tier } from "./types.js";

/** Formulas and constants are the literal spec from nora's `plan` document, §3. */
export const ZOMBIE_ACTIVITY_FACTOR = 0.4;
export const STAR_SATURATION = 5000;
export const DEFAULT_CLOSED_SOURCE_SCALE = 0.6;
export const DIRECT_WEIGHT = 1.0;
export const ADJACENT_WEIGHT = 0.5;
export const COMPETITION_SATURATION_K = 4;

export function competitorStrength(c: ScoredCompetitor): number {
  const activityFactor = (c.lastReleaseAgeDays ?? Infinity) <= ACTIVE_WINDOW_DAYS ? 1 : ZOMBIE_ACTIVITY_FACTOR;
  const scaleFactor = c.isOpenSource
    ? Math.min(Math.log10(1 + (c.githubStars ?? 0)) / Math.log10(1 + STAR_SATURATION), 1)
    : DEFAULT_CLOSED_SOURCE_SCALE;
  const typeWeight = c.competitorType === "DIRECT" ? DIRECT_WEIGHT : ADJACENT_WEIGHT;
  return typeWeight * activityFactor * (0.5 + 0.5 * scaleFactor);
}

/**
 * DIY/status-quo alternatives are tracked in the taxonomy but excluded from this score entirely —
 * they aren't product competition in the sense this score measures (§5.1 of nora's spec).
 */
function productCompetitors(competitors: readonly ScoredCompetitor[]): ScoredCompetitor[] {
  return competitors.filter((c) => c.competitorType !== "DIY_STATUS_QUO");
}

export function competitionScore(competitors: readonly ScoredCompetitor[]): number {
  const mass = productCompetitors(competitors).reduce((s, c) => s + competitorStrength(c), 0);
  return 100 * (1 - Math.exp(-mass / COMPETITION_SATURATION_K));
}

export function competitionConfidence(competitors: readonly ScoredCompetitor[]): Tier {
  const product = productCompetitors(competitors);
  if (product.length === 0) return "low"; // forced
  const channelDiverse = product.some((c) => c.discoveredVia.length >= 2);
  if (product.length >= 3 && channelDiverse) return "high";
  if (product.length >= 1) return "medium";
  return "low";
}
