import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { evidence } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";

export function contentHash(source: string, kind: string, url: string, body: string): string {
  return createHash("sha256").update(`${source}:${kind}:${url}:${body}`).digest("hex");
}

export interface FetchAndCacheOptions {
  readonly db: IdeaForgeDb;
  readonly ideaId: string;
  readonly source: "reddit" | "github";
  readonly kind: string;
  readonly url: string;
  readonly fetchFn: () => Promise<unknown>;
}

export interface FetchAndCacheResult<T> {
  readonly data: T;
  /** True when this response was served from the evidence table without an HTTP call. */
  readonly cached: boolean;
  readonly evidenceId: string;
}

/**
 * Looks the URL up in `evidence` before ever calling the network — a second `ideaforge eval` on
 * the same idea makes zero HTTP calls for anything already collected. The stored row is keyed by a
 * content hash of the response body, so two different queries that happen to return identical
 * content collapse to one evidence row.
 */
export async function fetchAndCache<T>(opts: FetchAndCacheOptions): Promise<FetchAndCacheResult<T>> {
  const existing = opts.db
    .select()
    .from(evidence)
    .where(
      and(
        eq(evidence.ideaId, opts.ideaId),
        eq(evidence.source, opts.source),
        eq(evidence.kind, opts.kind),
        eq(evidence.url, opts.url),
      ),
    )
    .get();

  if (existing) {
    return { data: JSON.parse(existing.rawJson) as T, cached: true, evidenceId: existing.id };
  }

  const data = (await opts.fetchFn()) as T;
  const rawJson = JSON.stringify(data);
  const id = contentHash(opts.source, opts.kind, opts.url, rawJson);
  opts.db
    .insert(evidence)
    .values({ id, ideaId: opts.ideaId, source: opts.source, kind: opts.kind, url: opts.url, rawJson })
    .onConflictDoNothing()
    .run();

  return { data, cached: false, evidenceId: id };
}
