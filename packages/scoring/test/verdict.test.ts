import { describe, expect, it } from "vitest";

import { overallConfidence, verdict } from "../src/verdict.js";
import type { VerdictInputs } from "../src/verdict.js";
import type { Score } from "../src/types.js";

function score(value: number, confidence: Score["confidence"] = "high"): Score {
  return { value, confidence };
}

const baseline: VerdictInputs = {
  demand: score(60),
  competition: score(40),
  complexity: score(30),
  margin: score(50),
  readiness: score(70),
};

describe("scoring: verdict rollup", () => {
  it("scores nora's worked example (invoiceforge freelancer idea, §10) as NOT_COLLECTED", () => {
    expect(verdict({ ...baseline, demand: "not_collected" })).toBe("NOT_COLLECTED");
  });

  it("returns NO_SIGNAL when demand is below the noise floor", () => {
    expect(verdict({ ...baseline, demand: score(19) })).toBe("NO_SIGNAL");
  });

  it("returns TOO_COMPLEX_FOR_WEDGE when complexity is high and readiness is low", () => {
    expect(verdict({ ...baseline, demand: score(60), complexity: score(70), readiness: score(30) })).toBe(
      "TOO_COMPLEX_FOR_WEDGE",
    );
  });

  it("returns CROWDED_BUT_VALIDATED when demand and competition are both high", () => {
    expect(verdict({ ...baseline, demand: score(50), competition: score(70) })).toBe("CROWDED_BUT_VALIDATED");
  });

  it("returns STRONG_WEDGE for validated demand, open competition, manageable build, decent margin", () => {
    expect(
      verdict({
        demand: score(50),
        competition: score(50),
        complexity: score(60),
        margin: score(40),
        readiness: score(70),
      }),
    ).toBe("STRONG_WEDGE");
  });

  it("falls back to WORTH_TESTING when no other rule matches", () => {
    expect(
      verdict({ demand: score(30), competition: score(20), complexity: score(50), margin: score(20), readiness: score(50) }),
    ).toBe("WORTH_TESTING");
  });

  it("first-match-wins: TOO_COMPLEX_FOR_WEDGE takes priority over CROWDED_BUT_VALIDATED", () => {
    expect(
      verdict({ demand: score(80), competition: score(90), complexity: score(80), margin: score(50), readiness: score(20) }),
    ).toBe("TOO_COMPLEX_FOR_WEDGE");
  });

  it("overall confidence is the weakest of the individual score tiers", () => {
    expect(overallConfidence([{ confidence: "high" }, { confidence: "medium" }, { confidence: "high" }])).toBe(
      "medium",
    );
    expect(overallConfidence([{ confidence: "high" }, { confidence: "high" }])).toBe("high");
    expect(overallConfidence([{ confidence: "low" }, { confidence: "high" }])).toBe("low");
  });
});
