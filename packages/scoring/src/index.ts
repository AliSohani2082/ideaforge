/**
 * Scores are deterministic code, never model output — the same evidence always yields the same
 * score, and re-scoring costs zero tokens. The real formulas and weights are nora's spec; this
 * placeholder proves the shape (fixed inputs -> a pure, table-testable function) it will be
 * implemented against.
 */
export interface ScoreInputs {
  readonly demandSignal: number;
  readonly competitionSignal: number;
}

export interface ScoreResult {
  readonly score: number;
  readonly breakdown: Readonly<Record<string, number>>;
}

export function scorePlaceholder(inputs: ScoreInputs): ScoreResult {
  const score = Math.round((inputs.demandSignal - inputs.competitionSignal) * 100) / 100;
  return {
    score,
    breakdown: {
      demandSignal: inputs.demandSignal,
      competitionSignal: inputs.competitionSignal,
    },
  };
}
