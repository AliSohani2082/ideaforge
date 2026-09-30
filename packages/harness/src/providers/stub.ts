import type { LlmProvider } from "../provider.js";

/**
 * Test-only provider: resolves a canned response instead of calling any real model. Used by unit
 * tests and the CLI's end-to-end test so CI never depends on network access or a Claude subscription.
 */
export interface StubProvider extends LlmProvider {
  readonly callCount: () => number;
}

export function createStubProvider(
  resolve: (prompt: string, jsonSchema: Record<string, unknown>) => unknown,
): StubProvider {
  let calls = 0;
  return {
    name: "claude-code",
    async complete(prompt, jsonSchema) {
      calls += 1;
      return resolve(prompt, jsonSchema);
    },
    callCount: () => calls,
  };
}
