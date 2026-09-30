import { eq } from "drizzle-orm";
import { steps } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import type { StepCache } from "@ideaforge/harness";

/** Adapts `@ideaforge/core`'s `steps` table (the resumable cache) to the harness's `StepCache` port. */
export function createDbStepCache(db: IdeaForgeDb, ideaId: string, runId: string): StepCache {
  return {
    async get(cacheKey) {
      const row = db.select().from(steps).where(eq(steps.cacheKey, cacheKey)).get();
      if (!row) return undefined;
      return {
        stepId: row.stepId,
        input: JSON.parse(row.input) as unknown,
        output: row.output ? (JSON.parse(row.output) as unknown) : null,
        status: row.status,
        error: row.error ?? undefined,
      };
    },
    async put(cacheKey, record) {
      db.insert(steps)
        .values({
          cacheKey,
          stepId: record.stepId,
          ideaId,
          runId,
          status: record.status,
          input: JSON.stringify(record.input),
          output: record.output != null ? JSON.stringify(record.output) : null,
          error: record.error ?? null,
        })
        .onConflictDoNothing()
        .run();
    },
  };
}
