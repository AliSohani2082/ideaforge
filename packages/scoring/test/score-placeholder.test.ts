import { describe, expect, it } from "vitest";

import { scorePlaceholder } from "../src/index.js";

describe("scoring: placeholder formula (table-driven)", () => {
  const cases: Array<{ name: string; demandSignal: number; competitionSignal: number; expected: number }> = [
    { name: "high demand, low competition", demandSignal: 0.9, competitionSignal: 0.1, expected: 0.8 },
    { name: "equal signals net to zero", demandSignal: 0.5, competitionSignal: 0.5, expected: 0 },
    { name: "low demand, high competition goes negative", demandSignal: 0.1, competitionSignal: 0.9, expected: -0.8 },
  ];

  it.each(cases)("$name", ({ demandSignal, competitionSignal, expected }) => {
    const result = scorePlaceholder({ demandSignal, competitionSignal });
    expect(result.score).toBe(expected);
    expect(result.breakdown).toEqual({ demandSignal, competitionSignal });
  });
});
