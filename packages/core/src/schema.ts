import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Domain model: ideas -> runs -> steps (resumable cache) -> evidence (raw fetched documents) ->
 * signals / competitors / features / competitor_features -> scores. Every derived row carries an
 * `evidenceIds` (or equivalent) provenance column so a score or signal can always be traced back
 * to the evidence it was computed from (joins over documents, not an in-memory reshuffle).
 *
 * Arrays and small structured payloads are stored as JSON text columns — SQLite has no native
 * array/object type, and a single portable `ideaforge.db` file is the whole self-hosting story.
 */

export const ideas = sqliteTable("ideas", {
  id: text("id").primaryKey(),
  statement: text("statement").notNull(),
  coreKeywords: text("core_keywords").notNull().default("[]"), // JSON string[]
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  status: text("status", { enum: ["running", "completed", "failed"] })
    .notNull()
    .default("running"),
  provider: text("provider", { enum: ["claude-code", "openrouter"] }).notNull(),
  error: text("error"),
  startedAt: text("started_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  completedAt: text("completed_at"),
});

export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;

/**
 * The resumable step cache. Keyed by `cacheKey` (a hash of step id + inputs + prompt version, see
 * `@ideaforge/harness`), not by run — so a second `ideaforge eval` on the same idea looks its steps
 * up by content address and replays every one that already has a `completed` row, regardless of
 * which run originally produced it. Re-running the same evaluation twice makes zero LLM calls.
 */
export const steps = sqliteTable("steps", {
  cacheKey: text("cache_key").primaryKey(),
  stepId: text("step_id").notNull(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  status: text("status", { enum: ["completed", "failed"] }).notNull(),
  input: text("input").notNull(), // JSON
  output: text("output"), // JSON, null when status = failed
  error: text("error"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type StepRow = typeof steps.$inferSelect;
export type NewStepRow = typeof steps.$inferInsert;

/**
 * Raw fetched documents (a Reddit post, a Reddit search page, a GitHub repo record). Content-hashed
 * so an identical response fetched twice collapses to one row and a second collector run hits cache.
 */
export const evidence = sqliteTable("evidence", {
  id: text("id").primaryKey(), // sha256 content hash of `source:kind:url:body`
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  source: text("source", { enum: ["reddit", "github"] }).notNull(),
  kind: text("kind").notNull(), // e.g. "reddit_post", "reddit_subreddit_search", "github_repo"
  url: text("url").notNull(),
  rawJson: text("raw_json").notNull(),
  fetchedAt: text("fetched_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type Evidence = typeof evidence.$inferSelect;
export type NewEvidence = typeof evidence.$inferInsert;

/** Demand theme clusters — `DemandSignal` in nora's spec (§8.6). */
export const signals = sqliteTable("signals", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  themeTag: text("theme_tag").notNull(),
  themeLabel: text("theme_label").notNull(),
  postCount: integer("post_count").notNull(),
  distinctAuthorCount: integer("distinct_author_count").notNull(),
  distinctSubredditCount: integer("distinct_subreddit_count").notNull(),
  subreddits: text("subreddits").notNull().default("[]"), // JSON string[]
  supportingEvidenceIds: text("supporting_evidence_ids").notNull().default("[]"), // JSON string[] -> evidence.id
  totalUpvotes: integer("total_upvotes").notNull(),
  totalComments: integer("total_comments").notNull(),
  workaroundMentionCount: integer("workaround_mention_count").notNull(),
  oldestCreatedUtc: integer("oldest_created_utc").notNull(),
  mostRecentCreatedUtc: integer("most_recent_created_utc").notNull(),
  clusterScore: real("cluster_score").notNull(),
  countedInScore: integer("counted_in_score", { mode: "boolean" }).notNull(),
  collectedAt: text("collected_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type Signal = typeof signals.$inferSelect;
export type NewSignal = typeof signals.$inferInsert;

/** `Competitor` in nora's spec (§9.2). */
export const competitors = sqliteTable("competitors", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  name: text("name").notNull(),
  url: text("url").notNull(),
  competitorType: text("competitor_type", { enum: ["DIRECT", "ADJACENT", "DIY_STATUS_QUO"] }).notNull(),
  isOpenSource: integer("is_open_source", { mode: "boolean" }).notNull(),
  githubRepo: text("github_repo"),
  githubStars: integer("github_stars"),
  pricingModel: text("pricing_model", {
    enum: ["FREE", "FREEMIUM", "SUBSCRIPTION", "ONE_TIME", "USAGE_BASED", "UNKNOWN"],
  })
    .notNull()
    .default("UNKNOWN"),
  targetSegment: text("target_segment", { enum: ["CONSUMER", "FREELANCER", "SMB", "ENTERPRISE"] }),
  platform: text("platform").notNull().default("[]"), // JSON string[]
  lastReleaseAgeDays: integer("last_release_age_days"),
  evidenceIds: text("evidence_ids").notNull().default("[]"), // JSON string[] -> evidence.id
  discoveredVia: text("discovered_via").notNull().default("[]"), // JSON string[]
  discoveredAt: text("discovered_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;

/** One row per competitor pricing tier — `Competitor.pricePoints[]` in nora's spec. */
export const pricePoints = sqliteTable("price_points", {
  id: text("id").primaryKey(),
  competitorId: text("competitor_id")
    .notNull()
    .references(() => competitors.id),
  tierName: text("tier_name").notNull(),
  monthlyPriceUsd: real("monthly_price_usd"),
  isFreeTier: integer("is_free_tier", { mode: "boolean" }).notNull(),
});

export type PricePoint = typeof pricePoints.$inferSelect;
export type NewPricePoint = typeof pricePoints.$inferInsert;

/** `FEATURE_VOCAB` — generated once per idea run, becomes the feature matrix's columns. */
export const features = sqliteTable("features", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  tag: text("tag").notNull(), // snake_case
  label: text("label").notNull(),
});

export type Feature = typeof features.$inferSelect;
export type NewFeature = typeof features.$inferInsert;

/** The feature x competitor matrix join. */
export const competitorFeatures = sqliteTable("competitor_features", {
  id: text("id").primaryKey(),
  competitorId: text("competitor_id")
    .notNull()
    .references(() => competitors.id),
  featureId: text("feature_id")
    .notNull()
    .references(() => features.id),
  present: integer("present", { mode: "boolean" }).notNull(),
  qualityFlag: text("quality_flag", { enum: ["GOOD", "BASIC", "POOR", "UNKNOWN"] }).notNull(),
  evidenceQuote: text("evidence_quote"),
  evidenceId: text("evidence_id").references(() => evidence.id),
});

export type CompetitorFeature = typeof competitorFeatures.$inferSelect;
export type NewCompetitorFeature = typeof competitorFeatures.$inferInsert;

/** One row per score per run (demand, competition, complexity, margin, readiness). */
export const scores = sqliteTable("scores", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  scoreType: text("score_type", {
    enum: ["demand", "competition", "complexity", "margin", "readiness"],
  }).notNull(),
  value: real("value"), // null when notCollected
  confidence: text("confidence", { enum: ["low", "medium", "high"] }),
  notCollected: integer("not_collected", { mode: "boolean" }).notNull().default(false),
  inputsJson: text("inputs_json").notNull(), // JSON snapshot of the inputs the formula consumed
  evidenceIds: text("evidence_ids").notNull().default("[]"), // JSON string[] -> evidence/signal/competitor ids
  computedAt: text("computed_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type ScoreRow = typeof scores.$inferSelect;
export type NewScoreRow = typeof scores.$inferInsert;

/** The overall verdict rollup (§6/§7 of nora's spec) — one per run. */
export const verdicts = sqliteTable("verdicts", {
  id: text("id").primaryKey(),
  ideaId: text("idea_id")
    .notNull()
    .references(() => ideas.id),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  verdict: text("verdict", {
    enum: [
      "NOT_COLLECTED",
      "NO_SIGNAL",
      "TOO_COMPLEX_FOR_WEDGE",
      "CROWDED_BUT_VALIDATED",
      "STRONG_WEDGE",
      "WORTH_TESTING",
    ],
  }).notNull(),
  overallConfidence: text("overall_confidence", { enum: ["low", "medium", "high"] }),
  computedAt: text("computed_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export type VerdictRow = typeof verdicts.$inferSelect;
export type NewVerdictRow = typeof verdicts.$inferInsert;
