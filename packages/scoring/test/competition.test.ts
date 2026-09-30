import { describe, expect, it } from "vitest";

import { competitionConfidence, competitionScore } from "../src/competition.js";
import type { ScoredCompetitor } from "../src/types.js";

function competitor(overrides: Partial<ScoredCompetitor> = {}): ScoredCompetitor {
  return {
    competitorType: "ADJACENT",
    isOpenSource: true,
    githubStars: 100,
    lastReleaseAgeDays: 10,
    discoveredVia: ["github"],
    ...overrides,
  };
}

describe("scoring: competition", () => {
  it("scores nora's worked example (invoiceforge freelancer idea, §10) at ~38.0", () => {
    const competitors: ScoredCompetitor[] = [
      competitor({ competitorType: "ADJACENT", githubStars: 10154, lastReleaseAgeDays: 1 }),
      competitor({ competitorType: "ADJACENT", githubStars: 10153, lastReleaseAgeDays: 1 }),
      competitor({ competitorType: "ADJACENT", githubStars: 8350, lastReleaseAgeDays: 781 }), // zombie
      competitor({ competitorType: "DIRECT", githubStars: 37, lastReleaseAgeDays: 72 }),
    ];
    expect(competitionScore(competitors)).toBeCloseTo(38.02, 1);
    // 4 competitors (>=3) but none discovered via 2+ channels -> medium, not high.
    expect(competitionConfidence(competitors)).toBe("medium");
  });

  it("excludes DIY/status-quo rows from the score and confidence entirely", () => {
    const diyOnly: ScoredCompetitor[] = [
      competitor({ competitorType: "DIY_STATUS_QUO", discoveredVia: ["reddit", "reddit"] }),
    ];
    expect(competitionScore(diyOnly)).toBe(0);
    expect(competitionConfidence(diyOnly)).toBe("low");
  });

  it("halves a stale (zombie) competitor's strength vs an identical active one", () => {
    const active = competitor({ lastReleaseAgeDays: 10 });
    const zombie = competitor({ lastReleaseAgeDays: 181 });
    expect(competitionScore([zombie])).toBeLessThan(competitionScore([active]));
  });

  it("defaults closed-source competitors to a neutral-high scale rather than zero", () => {
    const closedSource = competitor({ isOpenSource: false, githubStars: null });
    const score = competitionScore([closedSource]);
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0 and forces low confidence when no competitors are found", () => {
    expect(competitionScore([])).toBe(0);
    expect(competitionConfidence([])).toBe("low");
  });

  it.each([
    { count: 0, diverse: false, expected: "low" },
    { count: 2, diverse: false, expected: "medium" },
    { count: 3, diverse: false, expected: "medium" },
    { count: 3, diverse: true, expected: "high" },
  ] as const)("confidence with $count competitors, diverse=$diverse -> $expected", ({ count, diverse, expected }) => {
    const competitors = Array.from({ length: count }, (_, i) =>
      competitor({ discoveredVia: diverse && i === 0 ? ["github", "producthunt"] : ["github"] }),
    );
    expect(competitionConfidence(competitors)).toBe(expected);
  });
});
