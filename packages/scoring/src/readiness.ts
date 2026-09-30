import { ACTIVE_WINDOW_DAYS, TIER_RANK } from "./types.js";
import { INTEGRATION_CAP } from "./complexity.js";
import type { ComplexityExtraction, Integration, ScoredCompetitor, Tier } from "./types.js";

/** Formulas and constants are the literal spec from nora's `plan` document, §6. */
export const MATURITY_MAP: Record<Integration, boolean> = {
  PAYMENTS: true,
  CALENDAR: true,
  EMAIL_SENDING: true,
  SMS: true,
  EMAIL_INBOUND_PARSING: true,
  OAUTH_LOGIN: true,
  FILE_STORAGE: true,
  MAPS_GEO: true,
  VIDEO: true,
  OTHER: false,
};
export const MATURITY_BONUS_PER_ITEM = 4; // capped by INTEGRATION_CAP (5) -> max +20
export const TEMPLATE_BONUS = 10;

export function readinessScore(
  x: ComplexityExtraction,
  competitors: readonly ScoredCompetitor[],
  complexityScore: number,
): number {
  const raw = 100 - complexityScore;
  const matureCount = x.integrations.filter((i) => MATURITY_MAP[i]).length;
  const maturityBonus = Math.min(matureCount, INTEGRATION_CAP) * MATURITY_BONUS_PER_ITEM;
  // Template credit only for a competitor that is BOTH open-source AND still active — an abandoned
  // repo is not a usable reference implementation (fixed during nora's worked example, §7).
  const templateAvailable = competitors.some(
    (c) => c.isOpenSource && (c.lastReleaseAgeDays ?? Infinity) <= ACTIVE_WINDOW_DAYS,
  );
  const templateBonus = templateAvailable ? TEMPLATE_BONUS : 0;
  return Math.max(0, Math.min(100, raw + maturityBonus + templateBonus));
}

export function readinessConfidence(complexityConf: Tier, competitionConf: Tier): Tier {
  return TIER_RANK[complexityConf] <= TIER_RANK[competitionConf] ? complexityConf : competitionConf;
}
