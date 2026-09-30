import { eq } from "drizzle-orm";
import { competitorFeatures, competitors, features, ideas, newId, runs, scores, signals, verdicts } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import { GithubClient, RedditClient, lastReleaseAgeDays } from "@ideaforge/collectors";
import type { GithubCollector, GithubRepo, RedditCollector, RedditPost } from "@ideaforge/collectors";
import {
  competitorFeatureExtractionStep,
  ideaExtractionStep,
  painPointTaggingStep,
  runStep,
} from "@ideaforge/harness";
import type { CompetitorExtraction, LlmProvider, PostTag, StepCache } from "@ideaforge/harness";
import {
  MIN_CLUSTER_POSTS,
  clusterScore as computeClusterScore,
  competitionConfidence,
  competitionScore,
  complexityConfidence,
  complexityScore,
  demandConfidence,
  demandScore,
  edgeScores,
  marginConfidence,
  marginScore,
  overallConfidence,
  pickCompetitiveEdge,
  readinessConfidence,
  readinessScore,
  unaddressedFeatures,
  verdict as computeVerdict,
} from "@ideaforge/scoring";
import type {
  Cluster,
  DeliveryModel,
  EdgeCandidate,
  PricePoint,
  ScoredCompetitor,
  Score,
  Tier,
  Verdict,
} from "@ideaforge/scoring";

import { createDbStepCache } from "./step-cache-adapter.js";

export interface RunEvalOptions {
  readonly db: IdeaForgeDb;
  readonly provider: LlmProvider;
  readonly redditUserAgent?: string;
  readonly githubToken?: string;
  /** Unix seconds — matches Reddit's `created_utc` convention that the demand formula is written against. */
  readonly now?: () => number;
  /** Injectable for tests — defaults to a real RedditClient/GithubClient. */
  readonly redditClient?: RedditCollector;
  readonly githubClient?: GithubCollector;
}

export interface ScoreSummary {
  readonly scoreType: "demand" | "competition" | "complexity" | "margin" | "readiness";
  readonly value: number | null;
  readonly confidence: Tier | null;
  readonly notCollected: boolean;
}

export interface DemandThemeSummary {
  readonly themeTag: string;
  readonly themeLabel: string;
  readonly postCount: number;
  readonly distinctAuthorCount: number;
  readonly subreddits: readonly string[];
  readonly countedInScore: boolean;
  readonly clusterScore: number;
  readonly posts: ReadonlyArray<{ readonly title: string; readonly url: string; readonly author: string }>;
}

export interface CompetitorSummary {
  readonly name: string;
  readonly url: string;
  readonly competitorType: "DIRECT" | "ADJACENT";
  readonly isOpenSource: boolean;
  readonly githubStars: number | null;
  readonly lastReleaseAgeDays: number | null;
}

export interface RunEvalResult {
  readonly ideaId: string;
  readonly runId: string;
  readonly statement: string;
  readonly coreKeywords: readonly string[];
  readonly scoresSummary: readonly ScoreSummary[];
  readonly verdict: Verdict;
  readonly overallConfidence: Tier | null;
  readonly demandThemes: readonly DemandThemeSummary[];
  readonly competitorsSummary: readonly CompetitorSummary[];
  readonly featureVocab: readonly string[];
  readonly featureMatrix: ReadonlyArray<{
    readonly competitor: string;
    readonly featureTag: string;
    readonly present: boolean;
    readonly qualityFlag: string;
    readonly evidenceQuote: string;
  }>;
  readonly competitiveEdge: EdgeCandidate | null;
  readonly unaddressedFeatures: readonly EdgeCandidate[];
  /** Subreddits actually searched — printed so the report never launders sampling skew into false
   * confidence (nora's spec, §2 failure mode #4). */
  readonly subredditsSearched: readonly string[];
  readonly redditCollectionFailed: boolean;
  readonly githubRateLimitMessage: string | null;
  readonly demandNotCollectedReason: string | null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Finds an existing idea by exact statement match, or creates one — so a re-run of the same idea
 * text reuses the same evidence cache and step cache, not just the step cache alone. */
export function findOrCreateIdea(db: IdeaForgeDb, statement: string): { id: string } {
  const existing = db.select().from(ideas).where(eq(ideas.statement, statement)).get();
  if (existing) return { id: existing.id };
  const id = newId();
  db.insert(ideas).values({ id, statement }).run();
  return { id };
}

export async function runEval(statement: string, options: RunEvalOptions): Promise<RunEvalResult> {
  const db = options.db;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const { id: ideaId } = findOrCreateIdea(db, statement);

  const runId = newId();
  db.insert(runs).values({ id: runId, ideaId, provider: options.provider.name, status: "running" }).run();

  const cache: StepCache = createDbStepCache(db, ideaId, runId);
  const ctx = { provider: options.provider, cache };

  try {
    const { output: ideaExtraction } = await runStep(ideaExtractionStep, { statement }, ctx);
    db.update(ideas).set({ coreKeywords: JSON.stringify(ideaExtraction.coreKeywords) }).where(eq(ideas.id, ideaId)).run();

    const redditClient = options.redditClient ?? new RedditClient({ userAgent: options.redditUserAgent ?? "IdeaForge/0.1" });
    const githubClient = options.githubClient ?? new GithubClient({ userAgent: options.redditUserAgent ?? "IdeaForge/0.1", token: options.githubToken });

    let redditCollectionFailed = false;
    let redditPosts: RedditPost[] = [];
    let redditSubreddits: string[] = [];
    try {
      const result = await redditClient.collect(db, ideaId, ideaExtraction.coreKeywords);
      redditPosts = result.posts;
      redditSubreddits = result.subreddits;
    } catch {
      redditCollectionFailed = true;
    }

    const github = await githubClient.collect(db, ideaId, ideaExtraction.coreKeywords);

    // --- Pain-point tagging + demand clustering ---
    let postTags: PostTag[] = [];
    if (redditPosts.length > 0) {
      const { output } = await runStep(
        painPointTaggingStep,
        {
          themeVocab: ideaExtraction.themeVocab,
          posts: redditPosts.map((p) => ({ postId: p.id, title: p.title, selftext: p.selftext })),
        },
        ctx,
      );
      postTags = output;
    }
    const tagByPostId = new Map(postTags.map((t) => [t.postId, t]));
    const themeVocabSet = new Set(ideaExtraction.themeVocab);

    const groups = new Map<string, RedditPost[]>();
    for (const post of redditPosts) {
      const tag = tagByPostId.get(post.id);
      if (!tag || !tag.topicMatch) continue;
      const theme = themeVocabSet.has(tag.painThemeTag) ? tag.painThemeTag : "other";
      const group = groups.get(theme) ?? [];
      group.push(post);
      groups.set(theme, group);
    }

    const demandThemes: DemandThemeSummary[] = [];
    const qualifyingClusters: Cluster[] = [];
    const allQualifyingAuthors = new Set<string>();
    const allQualifyingSubreddits = new Set<string>();

    // Re-evaluating an idea replaces its stored signals/competitors/features rather than
    // accumulating duplicates — `runs`/`scores`/`verdicts` remain a per-run history, but the
    // evidence-derived taxonomy rows are idea-level current state, not run-scoped.
    const existingCompetitorIds = db.select({ id: competitors.id }).from(competitors).where(eq(competitors.ideaId, ideaId)).all().map((r) => r.id);
    for (const competitorId of existingCompetitorIds) {
      db.delete(competitorFeatures).where(eq(competitorFeatures.competitorId, competitorId)).run();
    }
    db.delete(competitors).where(eq(competitors.ideaId, ideaId)).run();
    db.delete(features).where(eq(features.ideaId, ideaId)).run();
    db.delete(signals).where(eq(signals.ideaId, ideaId)).run();

    for (const [themeTag, groupPosts] of groups) {
      const workaroundMentionCount = groupPosts.filter((p) => tagByPostId.get(p.id)?.mentionsPaidWorkaround).length;
      const cluster: Cluster = {
        posts: groupPosts.map((p) => ({ ups: p.ups, numComments: p.numComments, createdUtc: p.createdUtc, author: p.author })),
        workaroundMentionCount,
      };
      const countedInScore = groupPosts.length >= MIN_CLUSTER_POSTS;
      const subredditsInGroup = [...new Set(groupPosts.map((p) => p.subreddit))];
      const evidenceIds = [...new Set(groupPosts.map((p) => p.evidenceId))];
      const createdUtcs = groupPosts.map((p) => p.createdUtc);

      db.insert(signals)
        .values({
          id: newId(),
          ideaId,
          themeTag,
          themeLabel: themeTag.replace(/_/g, " "),
          postCount: groupPosts.length,
          distinctAuthorCount: new Set(groupPosts.map((p) => p.author)).size,
          distinctSubredditCount: subredditsInGroup.length,
          subreddits: JSON.stringify(subredditsInGroup),
          supportingEvidenceIds: JSON.stringify(evidenceIds),
          totalUpvotes: groupPosts.reduce((s, p) => s + p.ups, 0),
          totalComments: groupPosts.reduce((s, p) => s + p.numComments, 0),
          workaroundMentionCount,
          oldestCreatedUtc: Math.min(...createdUtcs),
          mostRecentCreatedUtc: Math.max(...createdUtcs),
          clusterScore: computeClusterScore(cluster, now()),
          countedInScore,
        })
        .run();

      demandThemes.push({
        themeTag,
        themeLabel: themeTag.replace(/_/g, " "),
        postCount: groupPosts.length,
        distinctAuthorCount: new Set(groupPosts.map((p) => p.author)).size,
        subreddits: subredditsInGroup,
        countedInScore,
        clusterScore: computeClusterScore(cluster, now()),
        posts: groupPosts.map((p) => ({ title: p.title, url: `https://reddit.com${p.permalink}`, author: p.author })),
      });

      if (countedInScore) {
        qualifyingClusters.push(cluster);
        for (const p of groupPosts) {
          allQualifyingAuthors.add(p.author);
          allQualifyingSubreddits.add(p.subreddit);
        }
      }
    }

    // --- Competitor / feature extraction ---
    let competitorExtractions: CompetitorExtraction[] = [];
    if (github.repos.length > 0) {
      const { output } = await runStep(
        competitorFeatureExtractionStep,
        {
          ideaStatement: statement,
          featureVocab: ideaExtraction.featureVocab,
          repos: github.repos.map((r) => ({ repoId: r.id, fullName: r.fullName, description: r.description, topics: r.topics })),
        },
        ctx,
      );
      competitorExtractions = output;
    }

    for (const tag of ideaExtraction.featureVocab) {
      db.insert(features).values({ id: newId(), ideaId, tag, label: tag.replace(/_/g, " ") }).run();
    }
    const featureIdByTag = new Map(
      db.select().from(features).where(eq(features.ideaId, ideaId)).all().map((f) => [f.tag, f.id]),
    );

    const repoById = new Map<string, GithubRepo>(github.repos.map((r) => [r.id, r]));
    const competitorRows: Array<{ id: string; extraction: CompetitorExtraction; repo: GithubRepo }> = [];
    for (const extraction of competitorExtractions) {
      const repo = repoById.get(extraction.repoId);
      if (!repo) continue;
      const competitorId = newId();
      db.insert(competitors)
        .values({
          id: competitorId,
          ideaId,
          name: repo.fullName,
          url: repo.htmlUrl,
          competitorType: extraction.competitorType,
          isOpenSource: true,
          githubRepo: repo.fullName,
          githubStars: repo.stars,
          pricingModel: "UNKNOWN", // GitHub metadata alone carries no pricing signal (v0 has no pricing-page collector)
          platform: JSON.stringify([]),
          lastReleaseAgeDays: lastReleaseAgeDays(repo.pushedAt),
          evidenceIds: JSON.stringify(github.evidenceId ? [github.evidenceId] : []),
          discoveredVia: JSON.stringify(["github"]),
        })
        .run();

      for (const row of extraction.features) {
        const featureId = featureIdByTag.get(row.featureTag);
        if (!featureId) continue;
        db.insert(competitorFeatures)
          .values({
            id: newId(),
            competitorId,
            featureId,
            present: row.present,
            qualityFlag: row.qualityFlag,
            evidenceQuote: row.evidenceQuote || null,
            evidenceId: github.evidenceId,
          })
          .run();
      }
      competitorRows.push({ id: competitorId, extraction, repo });
    }

    // v0's only collector is GitHub, which carries no pricing data — margin always sees an empty
    // price-point set until a pricing-page collector exists (documented in the PR description).
    const allPricePoints: PricePoint[] = [];

    // --- Scoring ---
    const scoredCompetitors: ScoredCompetitor[] = competitorRows.map((c) => ({
      competitorType: c.extraction.competitorType,
      isOpenSource: true,
      githubStars: c.repo.stars,
      lastReleaseAgeDays: lastReleaseAgeDays(c.repo.pushedAt),
      discoveredVia: ["github"],
    }));

    const competitionValue = competitionScore(scoredCompetitors);
    const competitionConf = competitionConfidence(scoredCompetitors);

    const ideaWords = wordCount(statement);
    const complexityValue = complexityScore(ideaExtraction.complexity);
    const complexityConf = complexityConfidence(ideaWords, ideaExtraction.complexity);

    const readinessValue = readinessScore(ideaExtraction.complexity, scoredCompetitors, complexityValue);
    const readinessConf = readinessConfidence(complexityConf, competitionConf);

    const marginValue = marginScore(allPricePoints, ideaExtraction.deliveryModel as DeliveryModel, complexityValue);
    const marginConf = marginConfidence(allPricePoints, ideaExtraction.deliveryModel as DeliveryModel);

    let demandSummary: ScoreSummary;
    let demandForVerdict: Score | "not_collected";
    let demandNotCollectedReason: string | null = null;
    if (redditCollectionFailed) {
      demandSummary = { scoreType: "demand", value: null, confidence: null, notCollected: true };
      demandForVerdict = "not_collected";
      demandNotCollectedReason =
        "Reddit collection failed for every query in this run — this is a collection failure, not a zero-demand finding. Re-run once Reddit is reachable before trusting a verdict on this idea.";
    } else {
      const demandValue = demandScore(qualifyingClusters, now());
      const demandConf = demandConfidence(qualifyingClusters.length, allQualifyingAuthors.size, allQualifyingSubreddits.size);
      demandSummary = { scoreType: "demand", value: demandValue, confidence: demandConf, notCollected: false };
      demandForVerdict = { value: demandValue, confidence: demandConf };
    }

    const competitionSummary: ScoreSummary = { scoreType: "competition", value: competitionValue, confidence: competitionConf, notCollected: false };
    const complexitySummary: ScoreSummary = { scoreType: "complexity", value: complexityValue, confidence: complexityConf, notCollected: false };
    const marginSummary: ScoreSummary = { scoreType: "margin", value: marginValue, confidence: marginConf, notCollected: false };
    const readinessSummary: ScoreSummary = { scoreType: "readiness", value: readinessValue, confidence: readinessConf, notCollected: false };

    const finalVerdict = computeVerdict({
      demand: demandForVerdict,
      competition: { value: competitionValue, confidence: competitionConf },
      complexity: { value: complexityValue, confidence: complexityConf },
      margin: { value: marginValue, confidence: marginConf },
      readiness: { value: readinessValue, confidence: readinessConf },
    });

    const finalOverallConfidence =
      finalVerdict === "NOT_COLLECTED"
        ? null
        : overallConfidence([
            { confidence: competitionConf },
            { confidence: complexityConf },
            { confidence: marginConf },
            { confidence: readinessConf },
            ...(demandForVerdict === "not_collected" ? [] : [{ confidence: demandForVerdict.confidence }]),
          ]);

    const scoresSummary = [demandSummary, competitionSummary, complexitySummary, marginSummary, readinessSummary];
    for (const s of scoresSummary) {
      db.insert(scores)
        .values({
          id: newId(),
          ideaId,
          runId,
          scoreType: s.scoreType,
          value: s.value,
          confidence: s.confidence,
          notCollected: s.notCollected,
          inputsJson: JSON.stringify(s),
          evidenceIds: JSON.stringify([]),
        })
        .run();
    }
    db.insert(verdicts).values({ id: newId(), ideaId, runId, verdict: finalVerdict, overallConfidence: finalOverallConfidence }).run();

    // --- Competitive edge ---
    const featureRows = competitorRows.flatMap((c) =>
      c.extraction.features.map((f) => ({ featureTag: f.featureTag, present: f.present, qualityFlag: f.qualityFlag })),
    );
    const demandThemeTags = new Set(demandThemes.map((t) => t.themeTag));
    const edgeCandidates = edgeScores(ideaExtraction.featureVocab, competitorRows.length, featureRows, demandThemeTags);
    const competitiveEdge = pickCompetitiveEdge(edgeCandidates);
    const unaddressed = unaddressedFeatures(edgeCandidates, demandThemeTags);

    db.update(runs).set({ status: "completed", completedAt: new Date().toISOString() }).where(eq(runs.id, runId)).run();

    return {
      ideaId,
      runId,
      statement,
      coreKeywords: ideaExtraction.coreKeywords,
      scoresSummary,
      verdict: finalVerdict,
      overallConfidence: finalOverallConfidence,
      demandThemes,
      competitorsSummary: competitorRows.map((c) => ({
        name: c.repo.fullName,
        url: c.repo.htmlUrl,
        competitorType: c.extraction.competitorType,
        isOpenSource: true,
        githubStars: c.repo.stars,
        lastReleaseAgeDays: lastReleaseAgeDays(c.repo.pushedAt),
      })),
      featureVocab: ideaExtraction.featureVocab,
      featureMatrix: competitorRows.flatMap((c) =>
        c.extraction.features.map((f) => ({
          competitor: c.repo.fullName,
          featureTag: f.featureTag,
          present: f.present,
          qualityFlag: f.qualityFlag,
          evidenceQuote: f.evidenceQuote,
        })),
      ),
      competitiveEdge,
      unaddressedFeatures: unaddressed,
      subredditsSearched: redditSubreddits,
      redditCollectionFailed,
      githubRateLimitMessage: github.rateLimitMessage,
      demandNotCollectedReason,
    };
  } catch (error) {
    db.update(runs)
      .set({ status: "failed", error: String(error), completedAt: new Date().toISOString() })
      .where(eq(runs.id, runId))
      .run();
    throw error;
  }
}
