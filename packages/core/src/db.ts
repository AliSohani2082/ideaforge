import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export type IdeaForgeDb = BetterSQLite3Database<typeof schema>;

const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    statement TEXT NOT NULL,
    core_keywords TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    status TEXT NOT NULL DEFAULT 'running',
    provider TEXT NOT NULL,
    error TEXT,
    started_at TEXT NOT NULL DEFAULT (current_timestamp),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS steps (
    cache_key TEXT PRIMARY KEY,
    step_id TEXT NOT NULL,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    status TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    url TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    theme_tag TEXT NOT NULL,
    theme_label TEXT NOT NULL,
    post_count INTEGER NOT NULL,
    distinct_author_count INTEGER NOT NULL,
    distinct_subreddit_count INTEGER NOT NULL,
    subreddits TEXT NOT NULL DEFAULT '[]',
    supporting_evidence_ids TEXT NOT NULL DEFAULT '[]',
    total_upvotes INTEGER NOT NULL,
    total_comments INTEGER NOT NULL,
    workaround_mention_count INTEGER NOT NULL,
    oldest_created_utc INTEGER NOT NULL,
    most_recent_created_utc INTEGER NOT NULL,
    cluster_score REAL NOT NULL,
    counted_in_score INTEGER NOT NULL,
    collected_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    competitor_type TEXT NOT NULL,
    is_open_source INTEGER NOT NULL,
    github_repo TEXT,
    github_stars INTEGER,
    pricing_model TEXT NOT NULL DEFAULT 'UNKNOWN',
    target_segment TEXT,
    platform TEXT NOT NULL DEFAULT '[]',
    last_release_age_days INTEGER,
    evidence_ids TEXT NOT NULL DEFAULT '[]',
    discovered_via TEXT NOT NULL DEFAULT '[]',
    discovered_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS price_points (
    id TEXT PRIMARY KEY,
    competitor_id TEXT NOT NULL REFERENCES competitors(id),
    tier_name TEXT NOT NULL,
    monthly_price_usd REAL,
    is_free_tier INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    tag TEXT NOT NULL,
    label TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS competitor_features (
    id TEXT PRIMARY KEY,
    competitor_id TEXT NOT NULL REFERENCES competitors(id),
    feature_id TEXT NOT NULL REFERENCES features(id),
    present INTEGER NOT NULL,
    quality_flag TEXT NOT NULL,
    evidence_quote TEXT,
    evidence_id TEXT REFERENCES evidence(id)
  );

  CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    score_type TEXT NOT NULL,
    value REAL,
    confidence TEXT,
    not_collected INTEGER NOT NULL DEFAULT 0,
    inputs_json TEXT NOT NULL,
    evidence_ids TEXT NOT NULL DEFAULT '[]',
    computed_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE TABLE IF NOT EXISTS verdicts (
    id TEXT PRIMARY KEY,
    idea_id TEXT NOT NULL REFERENCES ideas(id),
    run_id TEXT NOT NULL REFERENCES runs(id),
    verdict TEXT NOT NULL,
    overall_confidence TEXT,
    computed_at TEXT NOT NULL DEFAULT (current_timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_evidence_idea ON evidence(idea_id);
  CREATE INDEX IF NOT EXISTS idx_signals_idea ON signals(idea_id);
  CREATE INDEX IF NOT EXISTS idx_competitors_idea ON competitors(idea_id);
  CREATE INDEX IF NOT EXISTS idx_features_idea ON features(idea_id);
  CREATE INDEX IF NOT EXISTS idx_scores_run ON scores(run_id);
  CREATE INDEX IF NOT EXISTS idx_steps_idea ON steps(idea_id);
`;

/**
 * Opens (creating if needed) a single SQLite file as the whole persistence layer — no external
 * infrastructure required to self-host IdeaForge. Pass ":memory:" for tests.
 */
export function createDb(path = "ideaforge.db"): IdeaForgeDb {
  const sqlite = new Database(path);
  if (path !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(MIGRATIONS);
  return drizzle(sqlite, { schema });
}
