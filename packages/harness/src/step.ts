import type { LlmProvider } from "./provider.js";

export interface HarnessContext {
  readonly provider: LlmProvider;
}

/** A single node in the resumable step DAG: a prompt + JSON schema + cache key. */
export interface StepDefinition<Input, Output> {
  readonly id: string;
  cacheKey(input: Input): string;
  run(input: Input, ctx: HarnessContext): Promise<Output>;
}
