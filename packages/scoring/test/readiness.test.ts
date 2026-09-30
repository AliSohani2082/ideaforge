import { describe, expect, it } from "vitest";

import { readinessConfidence, readinessScore } from "../src/readiness.js";
import type { ComplexityExtraction, ScoredCompetitor } from "../src/types.js";

function extraction(overrides: Partial<ComplexityExtraction> = {}): ComplexityExtraction {
  return {
    integrations: [],
    requiresRealtime: false,
    requiresMobileApp: false,
    requiresRegulatedData: false,
    requiresMLModel: false,
    requiresTwoSidedMarketplace: false,
    ...overrides,
  };
}

function competitor(overrides: Partial<ScoredCompetitor> = {}): ScoredCompetitor {
  return {
    competitorType: "ADJACENT",
    isOpenSource: true,
    githubStars: 1000,
    lastReleaseAgeDays: 10,
    discoveredVia: ["github"],
    ...overrides,
  };
}

describe("scoring: readiness", () => {
  it("scores nora's worked example (invoiceforge freelancer idea, §10) at exactly 92", () => {
    const x = extraction({ integrations: ["PAYMENTS", "EMAIL_SENDING"] });
    const competitors = [
      competitor({ lastReleaseAgeDays: 1 }),
      competitor({ lastReleaseAgeDays: 1 }),
      competitor({ lastReleaseAgeDays: 781 }), // zombie, should not grant template credit
    ];
    expect(readinessScore(x, competitors, 26)).toBe(92);
    expect(readinessConfidence("high", "medium")).toBe("medium");
  });

  it("does not grant template credit from a stale (inactive) open-source competitor", () => {
    const x = extraction();
    const complexityScore = 10; // raw = 90
    const withOnlyZombie = readinessScore(x, [competitor({ lastReleaseAgeDays: 500 })], complexityScore);
    const withNoCompetitors = readinessScore(x, [], complexityScore);
    expect(withOnlyZombie).toBe(withNoCompetitors);
  });

  it("grants template credit only when a competitor is both open-source and active", () => {
    const x = extraction();
    const complexityScore = 10;
    const closedButActive = readinessScore(
      x,
      [competitor({ isOpenSource: false, lastReleaseAgeDays: 1 })],
      complexityScore,
    );
    const openAndActive = readinessScore(x, [competitor({ isOpenSource: true, lastReleaseAgeDays: 1 })], complexityScore);
    expect(openAndActive).toBeGreaterThan(closedButActive);
  });

  it("clamps to [0, 100]", () => {
    const heavyExtraction = extraction({
      integrations: ["PAYMENTS", "CALENDAR", "EMAIL_SENDING", "SMS", "OAUTH_LOGIN"],
      requiresRealtime: true,
      requiresMobileApp: true,
      requiresRegulatedData: true,
      requiresMLModel: true,
      requiresTwoSidedMarketplace: true,
    });
    // complexity would clamp at 100 -> raw readiness = 0, plus bonuses still floor at 0..100
    expect(readinessScore(heavyExtraction, [], 100)).toBeGreaterThanOrEqual(0);
    expect(readinessScore(extraction(), [competitor(), competitor()], 0)).toBeLessThanOrEqual(100);
  });

  it("inherits the weaker of the complexity and competition confidence tiers", () => {
    expect(readinessConfidence("high", "high")).toBe("high");
    expect(readinessConfidence("low", "high")).toBe("low");
    expect(readinessConfidence("high", "low")).toBe("low");
    expect(readinessConfidence("medium", "medium")).toBe("medium");
  });
});
