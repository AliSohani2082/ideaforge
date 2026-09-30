import { describe, expect, it } from "vitest";

import { complexityConfidence, complexityScore } from "../src/complexity.js";
import type { ComplexityExtraction } from "../src/types.js";

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

describe("scoring: complexity", () => {
  it("scores nora's worked example (invoiceforge freelancer idea, §10) at exactly 26", () => {
    const x = extraction({ integrations: ["PAYMENTS", "EMAIL_SENDING"] });
    expect(complexityScore(x)).toBe(26);
    expect(complexityConfidence(32, x)).toBe("high");
  });

  it("scores the empty extraction at the base complexity", () => {
    expect(complexityScore(extraction())).toBe(10);
  });

  it("caps integration points at INTEGRATION_CAP even with more integrations", () => {
    const x = extraction({
      integrations: ["PAYMENTS", "CALENDAR", "EMAIL_SENDING", "SMS", "OAUTH_LOGIN", "FILE_STORAGE"],
    });
    // base 10 + min(6,5)*8 = 50
    expect(complexityScore(x)).toBe(50);
  });

  it("weights regulated data as the single largest multiplier", () => {
    const regulated = complexityScore(extraction({ requiresRegulatedData: true }));
    const ml = complexityScore(extraction({ requiresMLModel: true }));
    const marketplace = complexityScore(extraction({ requiresTwoSidedMarketplace: true }));
    expect(regulated).toBeGreaterThan(ml);
    expect(regulated).toBeGreaterThan(marketplace);
  });

  it("clamps at 100 even when every flag is set with many integrations", () => {
    const x = extraction({
      integrations: ["PAYMENTS", "CALENDAR", "EMAIL_SENDING", "SMS", "OAUTH_LOGIN", "FILE_STORAGE", "VIDEO"],
      requiresRealtime: true,
      requiresMobileApp: true,
      requiresRegulatedData: true,
      requiresMLModel: true,
      requiresTwoSidedMarketplace: true,
    });
    expect(complexityScore(x)).toBe(100);
  });

  it("forces low confidence on a too-short idea statement even if extraction found signal", () => {
    expect(complexityConfidence(10, extraction({ integrations: ["PAYMENTS"] }))).toBe("low");
  });

  it("returns medium confidence for a long-enough statement that genuinely looks simple", () => {
    expect(complexityConfidence(30, extraction())).toBe("medium");
  });
});
