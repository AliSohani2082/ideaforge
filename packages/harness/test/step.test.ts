import { z } from "zod";
import { describe, expect, it } from "vitest";

import { createInMemoryStepCache } from "../src/cache.js";
import { createStubProvider } from "../src/providers/stub.js";
import { StepValidationError, runStep } from "../src/step.js";
import type { StepDefinition } from "../src/step.js";

const echoStep: StepDefinition<{ text: string }, { upper: string }> = {
  id: "echo",
  promptVersion: 1,
  jsonSchema: { type: "object", properties: { upper: { type: "string" } } },
  schema: z.object({ upper: z.string() }),
  buildPrompt: (input) => `uppercase: ${input.text}`,
};

describe("harness: runStep", () => {
  it("calls the provider on a cache miss and caches a validated result", async () => {
    const cache = createInMemoryStepCache();
    const provider = createStubProvider(() => ({ upper: "HELLO" }));

    const first = await runStep(echoStep, { text: "hello" }, { provider, cache });
    expect(first.output).toEqual({ upper: "HELLO" });
    expect(first.cached).toBe(false);
    expect(provider.callCount()).toBe(1);

    const second = await runStep(echoStep, { text: "hello" }, { provider, cache });
    expect(second.output).toEqual({ upper: "HELLO" });
    expect(second.cached).toBe(true);
    expect(provider.callCount()).toBe(1); // zero additional LLM calls
  });

  it("invalidates the cache when the input changes, not for unrelated steps", async () => {
    const cache = createInMemoryStepCache();
    const provider = createStubProvider((prompt) => ({ upper: prompt.includes("hello") ? "HELLO" : "WORLD" }));

    await runStep(echoStep, { text: "hello" }, { provider, cache });
    await runStep(echoStep, { text: "world" }, { provider, cache });
    expect(provider.callCount()).toBe(2);
  });

  it("invalidates the cache when promptVersion changes", async () => {
    const cache = createInMemoryStepCache();
    const provider = createStubProvider(() => ({ upper: "HELLO" }));

    await runStep(echoStep, { text: "hello" }, { provider, cache });
    const v2Step = { ...echoStep, promptVersion: 2 };
    const result = await runStep(v2Step, { text: "hello" }, { provider, cache });
    expect(result.cached).toBe(false);
    expect(provider.callCount()).toBe(2);
  });

  it("retries once on a schema-validation failure and succeeds if the retry is valid", async () => {
    const cache = createInMemoryStepCache();
    let call = 0;
    const provider = createStubProvider(() => {
      call += 1;
      return call === 1 ? { upper: 42 } : { upper: "HELLO" }; // first response fails schema
    });

    const result = await runStep(echoStep, { text: "hello" }, { provider, cache });
    expect(result.output).toEqual({ upper: "HELLO" });
    expect(provider.callCount()).toBe(2);
  });

  it("throws with the raw output attached after failing validation twice, and caches the failure", async () => {
    const cache = createInMemoryStepCache();
    const provider = createStubProvider(() => ({ upper: 42 }));

    await expect(runStep(echoStep, { text: "hello" }, { provider, cache })).rejects.toThrow(StepValidationError);
    expect(provider.callCount()).toBe(2);

    try {
      await runStep(echoStep, { text: "hello2" }, { provider, cache });
    } catch (error) {
      expect(error).toBeInstanceOf(StepValidationError);
      expect((error as StepValidationError).rawOutput).toEqual({ upper: 42 });
    }
  });
});
