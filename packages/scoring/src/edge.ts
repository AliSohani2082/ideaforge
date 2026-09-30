/** Competitive-edge rule (nora's spec, §9.4) — deterministic, over the feature matrix. */
export const EDGE_THRESHOLD = 0.5;

export interface FeatureRow {
  readonly featureTag: string;
  readonly present: boolean;
  readonly qualityFlag: "GOOD" | "BASIC" | "POOR" | "UNKNOWN";
}

export interface EdgeCandidate {
  readonly feature: string;
  readonly coverageCount: number;
  readonly edgeScore: number;
}

export function edgeScores(
  features: readonly string[],
  competitorCount: number,
  featureRows: readonly FeatureRow[],
  demandThemes: ReadonlySet<string>,
): EdgeCandidate[] {
  return features
    .map((f) => {
      const rows = featureRows.filter((r) => r.featureTag === f);
      const coverageCount = rows.filter((r) => r.present).length;
      const goodCount = rows.filter((r) => r.present && r.qualityFlag === "GOOD").length;
      const gapScore = competitorCount === 0 ? 0 : (competitorCount - goodCount) / competitorCount;
      const demandRelevance = demandThemes.has(f) ? 1 : 0.5; // pain-backed gaps outrank speculative ones
      return { feature: f, coverageCount, edgeScore: gapScore * (0.5 + 0.5 * demandRelevance) };
    })
    .sort((a, b) => b.edgeScore - a.edgeScore);
}

/**
 * A feature qualifies as "the gap worth attacking" only if it clears EDGE_THRESHOLD AND at least one
 * competitor attempted it (proves it's a validated axis, not a hallucinated one). If no competitor
 * attempted it, it's reported separately as an "unaddressed feature," and only surfaced if it also
 * traces to real demand evidence — an idea author's unvalidated assumption doesn't count.
 */
export function pickCompetitiveEdge(candidates: readonly EdgeCandidate[]): EdgeCandidate | null {
  return candidates.find((c) => c.edgeScore >= EDGE_THRESHOLD && c.coverageCount >= 1) ?? null;
}

export function unaddressedFeatures(
  candidates: readonly EdgeCandidate[],
  demandThemes: ReadonlySet<string>,
): EdgeCandidate[] {
  return candidates.filter((c) => c.coverageCount === 0 && demandThemes.has(c.feature));
}
