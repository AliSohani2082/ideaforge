/**
 * The step cache is a narrow interface so the harness stays independently testable — the CLI wires
 * it to `@ideaforge/core`'s `steps` table (content-addressed, resumable). A step's `output` reaches
 * this interface only after schema validation, so nothing unvalidated ever gets cached.
 */
export interface StepCacheRecord {
  readonly stepId: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly status: "completed" | "failed";
  readonly error?: string;
}

export interface StepCache {
  get(cacheKey: string): Promise<StepCacheRecord | undefined>;
  put(cacheKey: string, record: StepCacheRecord): Promise<void>;
}

/** In-memory cache — used by tests and by short-lived CLI invocations that don't need persistence. */
export function createInMemoryStepCache(): StepCache {
  const store = new Map<string, StepCacheRecord>();
  return {
    async get(cacheKey) {
      return store.get(cacheKey);
    },
    async put(cacheKey, record) {
      store.set(cacheKey, record);
    },
  };
}
