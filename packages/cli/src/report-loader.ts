import { desc, eq } from "drizzle-orm";
import { competitorFeatures, competitors, features, ideas, runs, scores, signals, verdicts } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import { edgeScores, pickCompetitiveEdge, unaddressedFeatures } from "@ideaforge/scoring";
import type { Tier } from "@ideaforge/scoring";

import type { CompetitorSummary, DemandThemeSummary, RunEvalResult, ScoreSummary } from "./orchestrate.js";

/**
 * Reconstructs a report from persisted rows for `ideaforge report <idea-id>` — re-rendering never
 * costs a token because scoring is deterministic over stored evidence, but it does mean per-run
 * transient warnings (e.g. a GitHub rate-limit message) aren't available after the process exits;
 * only durable domain state is reloaded.
 */
export function loadReportData(db: IdeaForgeDb, ideaId: string): RunEvalResult | null {
  const idea = db.select().from(ideas).where(eq(ideas.id, ideaId)).get();
  if (!idea) return null;

  const latestRun = db.select().from(runs).where(eq(runs.ideaId, ideaId)).orderBy(desc(runs.startedAt)).limit(1).get();
  const scoreRows = latestRun ? db.select().from(scores).where(eq(scores.runId, latestRun.id)).all() : [];
  const verdictRow = latestRun ? db.select().from(verdicts).where(eq(verdicts.runId, latestRun.id)).get() : undefined;

  const scoresSummary: ScoreSummary[] = scoreRows.map((r) => ({
    scoreType: r.scoreType,
    value: r.value,
    confidence: r.confidence,
    notCollected: r.notCollected,
  }));

  const signalRows = db.select().from(signals).where(eq(signals.ideaId, ideaId)).all();
  const demandThemes: DemandThemeSummary[] = signalRows.map((s) => ({
    themeTag: s.themeTag,
    themeLabel: s.themeLabel,
    postCount: s.postCount,
    distinctAuthorCount: s.distinctAuthorCount,
    subreddits: JSON.parse(s.subreddits) as string[],
    countedInScore: s.countedInScore,
    clusterScore: s.clusterScore,
    posts: [], // per-post links aren't re-derivable from the signal row alone; see evidence table for raw data
  }));
  const subredditsSearched = [...new Set(demandThemes.flatMap((t) => t.subreddits))];

  const competitorRows = db.select().from(competitors).where(eq(competitors.ideaId, ideaId)).all();
  const competitorsSummary: CompetitorSummary[] = competitorRows.map((c) => ({
    name: c.name,
    url: c.url,
    competitorType: c.competitorType === "DIY_STATUS_QUO" ? "ADJACENT" : c.competitorType,
    isOpenSource: c.isOpenSource,
    githubStars: c.githubStars,
    lastReleaseAgeDays: c.lastReleaseAgeDays,
  }));

  const featureRows = db.select().from(features).where(eq(features.ideaId, ideaId)).all();
  const featureVocab = featureRows.map((f) => f.tag);
  const competitorFeatureRows = competitorRows.flatMap((c) =>
    db
      .select()
      .from(competitorFeatures)
      .where(eq(competitorFeatures.competitorId, c.id))
      .all()
      .map((row) => ({ competitor: c.name, featureId: row.featureId, present: row.present, qualityFlag: row.qualityFlag, evidenceQuote: row.evidenceQuote ?? "" })),
  );
  const featureTagById = new Map(featureRows.map((f) => [f.id, f.tag]));
  const featureMatrix = competitorFeatureRows.map((row) => ({
    competitor: row.competitor,
    featureTag: featureTagById.get(row.featureId) ?? row.featureId,
    present: row.present,
    qualityFlag: row.qualityFlag,
    evidenceQuote: row.evidenceQuote,
  }));

  const demandThemeTags = new Set(demandThemes.map((t) => t.themeTag));
  const edgeCandidates = edgeScores(
    featureVocab,
    competitorRows.length,
    featureMatrix.map((f) => ({ featureTag: f.featureTag, present: f.present, qualityFlag: f.qualityFlag as "GOOD" | "BASIC" | "POOR" | "UNKNOWN" })),
    demandThemeTags,
  );

  const demandRow = scoresSummary.find((s) => s.scoreType === "demand");

  return {
    ideaId,
    runId: latestRun?.id ?? "",
    statement: idea.statement,
    coreKeywords: JSON.parse(idea.coreKeywords) as string[],
    scoresSummary,
    verdict: verdictRow?.verdict ?? "NOT_COLLECTED",
    overallConfidence: (verdictRow?.overallConfidence as Tier | null) ?? null,
    demandThemes,
    competitorsSummary,
    featureVocab,
    featureMatrix,
    competitiveEdge: pickCompetitiveEdge(edgeCandidates),
    unaddressedFeatures: unaddressedFeatures(edgeCandidates, demandThemeTags),
    subredditsSearched,
    redditCollectionFailed: demandRow?.notCollected ?? false,
    githubRateLimitMessage: null,
    demandNotCollectedReason: demandRow?.notCollected
      ? "Reddit collection failed during the run that produced this report — re-run `ideaforge eval` to retry."
      : null,
  };
}
