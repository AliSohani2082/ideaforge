import { createDb, evidence } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import { createStubProvider } from "@ideaforge/harness";
import { describe, expect, it } from "vitest";

import type { GithubCollectionResult, GithubCollector, RedditCollectionResult, RedditCollector, RedditPost } from "@ideaforge/collectors";

import { runEval } from "../src/orchestrate.js";
import { renderReport } from "../src/report.js";

function stubRedditPost(overrides: Partial<RedditPost>): RedditPost {
  return {
    id: "t3_default",
    title: "default",
    selftext: "",
    author: "author",
    ups: 10,
    numComments: 5,
    createdUtc: Math.floor(Date.now() / 1000),
    subreddit: "freelance",
    crosspostParentId: null,
    stickied: false,
    permalink: "/r/freelance/comments/default/",
    accountAgeUnknown: true,
    outboundLinkCount: 0,
    evidenceId: "ev-reddit-1",
    ...overrides,
  };
}

const STUB_POSTS: RedditPost[] = [
  stubRedditPost({ id: "t3_a", author: "a", title: "I wish there was a tool that chased late payers" }),
  stubRedditPost({ id: "t3_b", author: "b", title: "anyone know a tool that chases late payers" }),
  stubRedditPost({ id: "t3_c", author: "c", title: "sick of chasing late payers manually" }),
];

/** Seeds a fake evidence row so persisted rows that reference it satisfy the real schema's FK,
 * the way a real collector's `fetchAndCache` would have. */
function seedEvidence(db: IdeaForgeDb, ideaId: string, id: string, source: "reddit" | "github"): void {
  db.insert(evidence)
    .values({ id, ideaId, source, kind: `${source}_stub`, url: `https://example.com/${id}`, rawJson: "{}" })
    .onConflictDoNothing()
    .run();
}

function createStubRedditCollector(): RedditCollector & { callCount: () => number } {
  let calls = 0;
  return {
    async collect(db, ideaId): Promise<RedditCollectionResult> {
      calls += 1;
      seedEvidence(db, ideaId, "ev-reddit-1", "reddit");
      return { subreddits: ["freelance", "smallbusiness"], posts: STUB_POSTS };
    },
    callCount: () => calls,
  };
}

function createStubGithubCollector(): GithubCollector & { callCount: () => number } {
  let calls = 0;
  return {
    async collect(db, ideaId): Promise<GithubCollectionResult> {
      calls += 1;
      seedEvidence(db, ideaId, "ev-github-1", "github");
      return {
        repos: [
          {
            id: "acme/invoiceninja",
            fullName: "acme/invoiceninja",
            description: "Invoicing and billing platform",
            htmlUrl: "https://github.com/acme/invoiceninja",
            stars: 10000,
            pushedAt: new Date().toISOString(),
            topics: ["invoicing"],
            license: "MIT",
            fork: false,
          },
        ],
        rateLimitMessage: null,
        evidenceId: "ev-github-1",
      };
    },
    callCount: () => calls,
  };
}

function createFakeLlmProvider() {
  return createStubProvider((prompt: string, _jsonSchema: Record<string, unknown>) => {
    if (prompt.includes("Idea statement:") && prompt.includes("coreKeywords")) {
      return {
        coreKeywords: ["invoicing", "late payment"],
        themeVocab: ["late_payment_chasing", "other"],
        featureVocab: ["auto_reminders", "invoicing"],
        complexity: {
          integrations: ["PAYMENTS", "EMAIL_SENDING"],
          requiresRealtime: false,
          requiresMobileApp: false,
          requiresRegulatedData: false,
          requiresMLModel: false,
          requiresTwoSidedMarketplace: false,
        },
        deliveryModel: "SELF_SERVE_SAAS",
      };
    }
    if (prompt.includes("tagging Reddit posts")) {
      return STUB_POSTS.map((p) => ({
        postId: p.id,
        topicMatch: true,
        painThemeTag: "late_payment_chasing",
        mentionsPaidWorkaround: false,
      }));
    }
    if (prompt.includes("classifying GitHub")) {
      return [
        {
          repoId: "acme/invoiceninja",
          competitorType: "ADJACENT",
          features: [
            // Attempted but poorly ("some competitor attempted it" -> a validated, not hallucinated, gap).
            { featureTag: "auto_reminders", present: true, qualityFlag: "POOR", evidenceQuote: "basic reminder emails" },
            { featureTag: "invoicing", present: true, qualityFlag: "GOOD", evidenceQuote: "full invoicing suite" },
          ],
        },
      ];
    }
    throw new Error(`Unexpected prompt in test stub: ${prompt.slice(0, 100)}`);
  });
}

describe("cli: eval end-to-end (stubbed provider + collectors)", () => {
  it("produces a report with real (stubbed) evidence and demand/competition scores", async () => {
    const db = createDb(":memory:");
    const provider = createFakeLlmProvider();
    const redditClient = createStubRedditCollector();
    const githubClient = createStubGithubCollector();

    const result = await runEval("A tool that chases late-paying freelance clients automatically", {
      db,
      provider,
      redditClient,
      githubClient,
    });

    expect(result.verdict).not.toBe("NOT_COLLECTED");
    expect(result.redditCollectionFailed).toBe(false);

    const demand = result.scoresSummary.find((s) => s.scoreType === "demand");
    expect(demand?.notCollected).toBe(false);
    expect(demand?.value).toBeGreaterThan(0); // 3 distinct-author posts form a qualifying cluster

    expect(result.competitorsSummary).toHaveLength(1);
    expect(result.competitorsSummary[0]?.name).toBe("acme/invoiceninja");
    expect(result.competitiveEdge?.feature).toBe("auto_reminders"); // the gap no competitor covers well

    const markdown = renderReport(result);
    expect(markdown).toContain("# IdeaForge report:");
    expect(markdown).toContain("late_payment_chasing".replace(/_/g, " "));
    expect(markdown).toContain("acme/invoiceninja");
    expect(markdown).toContain(result.verdict);
  });

  it("makes zero additional LLM calls on a second eval of the same idea (content-addressed cache)", async () => {
    const db = createDb(":memory:");
    const provider = createFakeLlmProvider();
    const redditClient = createStubRedditCollector();
    const githubClient = createStubGithubCollector();
    const statement = "A tool that chases late-paying freelance clients automatically";

    const first = await runEval(statement, { db, provider, redditClient, githubClient });
    const callsAfterFirstRun = provider.callCount();
    expect(callsAfterFirstRun).toBeGreaterThan(0);

    const second = await runEval(statement, { db, provider, redditClient, githubClient });
    expect(provider.callCount()).toBe(callsAfterFirstRun); // zero new LLM calls
    expect(second.verdict).not.toBe("NOT_COLLECTED");
    expect(second.ideaId).toBe(first.ideaId); // same idea statement reuses the same idea row
  });
});
