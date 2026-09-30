import type { ZodType } from "zod";

import { contentAddress } from "./content-address.js";
import type { StepCache } from "./cache.js";
import type { LlmProvider } from "./provider.js";

export interface HarnessContext {
  readonly provider: LlmProvider;
  readonly cache: StepCache;
}

/** A single node in the resumable step DAG: a prompt + JSON schema + cache key. */
export interface StepDefinition<Input, Output> {
  readonly id: string;
  /** Bumping this invalidates exactly the cached steps built on the old prompt — nothing else. */
  readonly promptVersion: number;
  readonly jsonSchema: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- schemas may transform their input shape (e.g. defaults)
  readonly schema: ZodType<Output, any, any>;
  buildPrompt(input: Input): string;
}

class RawValidationFailure extends Error {
  constructor(
    readonly raw: unknown,
    cause: unknown,
  ) {
    super("Model response failed schema validation");
    this.cause = cause;
  }
}

export class StepValidationError extends Error {
  constructor(
    readonly stepId: string,
    readonly rawOutput: unknown,
    cause: unknown,
  ) {
    super(`Step "${stepId}" produced output that failed schema validation after 1 retry`);
    this.cause = cause;
  }
}

export interface StepRunResult<Output> {
  readonly output: Output;
  /** True when this result came from the content-addressed cache — zero LLM calls were made. */
  readonly cached: boolean;
  readonly cacheKey: string;
}

/**
 * Runs a step through the resumable cache: an identical (stepId, promptVersion, input) tuple hits
 * cache and never calls the provider. On a cache miss the model response is validated against the
 * step's schema, retried once on failure, and only a validated response is ever cached.
 */
export async function runStep<Input, Output>(
  def: StepDefinition<Input, Output>,
  input: Input,
  ctx: HarnessContext,
): Promise<StepRunResult<Output>> {
  const cacheKey = contentAddress({ stepId: def.id, promptVersion: def.promptVersion, input });

  const cached = await ctx.cache.get(cacheKey);
  if (cached?.status === "completed") {
    return { output: cached.output as Output, cached: true, cacheKey };
  }

  const prompt = def.buildPrompt(input);
  const attempt = async (): Promise<Output> => {
    const raw = await ctx.provider.complete(prompt, def.jsonSchema);
    const parsed = def.schema.safeParse(raw);
    if (!parsed.success) {
      throw new RawValidationFailure(raw, parsed.error);
    }
    return parsed.data;
  };

  let output: Output;
  try {
    output = await attempt();
  } catch {
    try {
      output = await attempt(); // retry once on validation failure
    } catch (secondError) {
      const raw = secondError instanceof RawValidationFailure ? secondError.raw : undefined;
      await ctx.cache.put(cacheKey, {
        stepId: def.id,
        input,
        output: null,
        status: "failed",
        error: String(secondError),
      });
      throw new StepValidationError(def.id, raw, secondError);
    }
  }

  await ctx.cache.put(cacheKey, { stepId: def.id, input, output, status: "completed" });
  return { output, cached: false, cacheKey };
}
