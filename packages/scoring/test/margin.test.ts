import { describe, expect, it } from "vitest";

import { marginConfidence, marginScore } from "../src/margin.js";
import type { PricePoint } from "../src/types.js";

function pricePoint(overrides: Partial<PricePoint> = {}): PricePoint {
  return { monthlyPriceUsd: 10, isFreeTier: false, competitorId: "c1", ...overrides };
}

describe("scoring: margin", () => {
  it("scores nora's worked example (invoiceninja pricing, §10) at ~77.9", () => {
    const prices: PricePoint[] = [
      pricePoint({ monthlyPriceUsd: null, isFreeTier: true }),
      pricePoint({ monthlyPriceUsd: 14 }),
      pricePoint({ monthlyPriceUsd: 18 }),
      pricePoint({ monthlyPriceUsd: 23.33 }),
    ];
    const complexityScore = 26; // < 40 -> SaaS cost-to-serve assumption of $1.50
    expect(marginScore(prices, "SELF_SERVE_SAAS", complexityScore)).toBeCloseTo(77.92, 1);
    // 3 paid tiers (>=3) but all from one competitor (distinctPricedCompetitors=1) -> medium, not high.
    expect(marginConfidence(prices, "SELF_SERVE_SAAS")).toBe("medium");
  });

  it("falls back to the neutral-below-midpoint default when no competitor has pricing data", () => {
    expect(marginScore([], "SELF_SERVE_SAAS", 26)).toBe(40);
    expect(marginConfidence([], "SELF_SERVE_SAAS")).toBe("low");
  });

  it("routes marketplace take-rate models to the fixed midpoint, always low-confidence", () => {
    const prices = [pricePoint({ monthlyPriceUsd: 30 })];
    expect(marginScore(prices, "MARKETPLACE_TAKE_RATE", 50)).toBe(55);
    expect(marginConfidence(prices, "MARKETPLACE_TAKE_RATE")).toBe("low");
  });

  it("penalizes a strong free tier that compresses achievable pricing", () => {
    const withFree = [pricePoint({ monthlyPriceUsd: 20 }), pricePoint({ monthlyPriceUsd: 0, isFreeTier: true })];
    const withoutFree = [pricePoint({ monthlyPriceUsd: 20 })];
    expect(marginScore(withFree, "SELF_SERVE_SAAS", 26)).toBeLessThan(
      marginScore(withoutFree, "SELF_SERVE_SAAS", 26),
    );
  });

  it("scales cost-to-serve assumption with complexity band for SaaS", () => {
    const prices = [pricePoint({ monthlyPriceUsd: 100 })];
    const cheap = marginScore(prices, "SELF_SERVE_SAAS", 20); // cost 1.5
    const mid = marginScore(prices, "SELF_SERVE_SAAS", 50); // cost 4
    const expensive = marginScore(prices, "SELF_SERVE_SAAS", 90); // cost 10
    expect(cheap).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(expensive);
  });

  it("requires diversity across competitors, not just tier count, for high confidence", () => {
    const threeTiersOneCompetitor: PricePoint[] = [
      pricePoint({ monthlyPriceUsd: 5, competitorId: "a" }),
      pricePoint({ monthlyPriceUsd: 10, competitorId: "a" }),
      pricePoint({ monthlyPriceUsd: 20, competitorId: "a" }),
    ];
    const threeTiersTwoCompetitors: PricePoint[] = [
      pricePoint({ monthlyPriceUsd: 5, competitorId: "a" }),
      pricePoint({ monthlyPriceUsd: 10, competitorId: "a" }),
      pricePoint({ monthlyPriceUsd: 20, competitorId: "b" }),
    ];
    expect(marginConfidence(threeTiersOneCompetitor, "SELF_SERVE_SAAS")).toBe("medium");
    expect(marginConfidence(threeTiersTwoCompetitors, "SELF_SERVE_SAAS")).toBe("high");
  });
});
