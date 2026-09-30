import { describe, expect, it } from "vitest";

import { edgeScores, pickCompetitiveEdge, unaddressedFeatures } from "../src/edge.js";
import type { FeatureRow } from "../src/edge.js";

describe("scoring: competitive edge", () => {
  it("scores a gap higher when no competitor does it well, and highest when it's also demand-backed", () => {
    const rows: FeatureRow[] = [
      { featureTag: "auto_reminders", present: true, qualityFlag: "POOR" },
      { featureTag: "auto_reminders", present: true, qualityFlag: "POOR" },
      { featureTag: "invoicing", present: true, qualityFlag: "GOOD" },
      { featureTag: "invoicing", present: true, qualityFlag: "GOOD" },
    ];
    const demandThemes = new Set(["auto_reminders"]);
    const scores = edgeScores(["auto_reminders", "invoicing"], 2, rows, demandThemes);

    expect(scores[0]?.feature).toBe("auto_reminders");
    expect(scores[0]!.edgeScore).toBeGreaterThan(scores[1]!.edgeScore);
  });

  it("requires coverageCount >= 1 to qualify as a validated competitive edge", () => {
    const rows: FeatureRow[] = []; // no competitor attempted anything
    const scores = edgeScores(["never_attempted"], 3, rows, new Set(["never_attempted"]));
    expect(pickCompetitiveEdge(scores)).toBeNull();
  });

  it("surfaces an unaddressed feature only when it also traces to real demand evidence", () => {
    const rows: FeatureRow[] = [];
    const scores = edgeScores(["speculative", "validated_gap"], 2, rows, new Set(["validated_gap"]));
    const unaddressed = unaddressedFeatures(scores, new Set(["validated_gap"]));
    expect(unaddressed.map((f) => f.feature)).toEqual(["validated_gap"]);
  });

  it("picks a feature as the competitive edge once it clears the threshold with real coverage", () => {
    const rows: FeatureRow[] = [
      { featureTag: "auto_reminders", present: true, qualityFlag: "POOR" },
      { featureTag: "auto_reminders", present: true, qualityFlag: "BASIC" },
    ];
    const scores = edgeScores(["auto_reminders"], 2, rows, new Set(["auto_reminders"]));
    expect(pickCompetitiveEdge(scores)?.feature).toBe("auto_reminders");
  });
});
