import { TIER_RANK } from "./types.js";
import type { Score, Tier, Verdict } from "./types.js";

/**
 * No single blended number: a weighted average across five scores with different, sometimes
 * opposite, directions would flatten exactly the tension this tool exists to surface. Instead a
 * deterministic decision table maps the five scores to one discrete verdict, first match wins
 * (nora's `plan` document, §7).
 */
export interface VerdictInputs {
  readonly demand: Score | "not_collected";
  readonly competition: Score;
  readonly complexity: Score;
  readonly margin: Score;
  readonly readiness: Score;
}

export function verdict(s: VerdictInputs): Verdict {
  if (s.demand === "not_collected") return "NOT_COLLECTED"; // §1.1 — refuse to guess, not "no demand"
  if (s.demand.value < 20) return "NO_SIGNAL";
  if (s.complexity.value >= 70 && s.readiness.value <= 30) return "TOO_COMPLEX_FOR_WEDGE";
  if (s.demand.value >= 50 && s.competition.value >= 70) return "CROWDED_BUT_VALIDATED";
  if (
    s.demand.value >= 50 &&
    s.competition.value <= 50 &&
    s.complexity.value <= 60 &&
    s.margin.value >= 40
  ) {
    return "STRONG_WEDGE";
  }
  return "WORTH_TESTING";
}

export function overallConfidence(scoresWithConfidence: ReadonlyArray<{ confidence: Tier }>): Tier {
  return scoresWithConfidence.reduce<Tier>(
    (worst, s) => (TIER_RANK[s.confidence] < TIER_RANK[worst] ? s.confidence : worst),
    "high",
  );
}
