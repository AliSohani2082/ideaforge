/**
 * Evidence collectors are plain HTTP + cache-to-SQLite — they never call an LLM. This is a
 * placeholder for the reddit/github/producthunt/hn collectors implemented in the v0 slice.
 */

export const COLLECTOR_SOURCES = ["reddit", "github", "producthunt", "hackernews"] as const;

export type CollectorSource = (typeof COLLECTOR_SOURCES)[number];

export interface RateLimit {
  readonly requestsPerInterval: number;
  readonly intervalMs: number;
}

export interface CollectorResult<T> {
  readonly source: CollectorSource;
  readonly fetchedAt: string;
  readonly data: T;
}

export interface Collector<T> {
  readonly source: CollectorSource;
  readonly rateLimit: RateLimit;
  collect(query: string): Promise<CollectorResult<T>>;
}
