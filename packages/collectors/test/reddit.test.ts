import { createDb, ideas, newId } from "@ideaforge/core";
import { describe, expect, it } from "vitest";

import { RedditClient, dedupeCrossposts, isNoise } from "../src/reddit.js";
import type { HttpClient } from "../src/http.js";
import type { RedditPost } from "../src/reddit.js";

import subredditSearchFixture from "./fixtures/reddit-subreddit-search.json" with { type: "json" };
import searchResultsFixture from "./fixtures/reddit-search-results.json" with { type: "json" };
import userSubmittedFixture from "./fixtures/reddit-user-submitted.json" with { type: "json" };

function fixtureHttpClient(): HttpClient {
  return {
    async getJson(url: string) {
      if (url.includes("/subreddits/search.json")) return subredditSearchFixture;
      if (url.includes("/user/")) return userSubmittedFixture;
      if (url.includes("/search.json")) return searchResultsFixture;
      throw new Error(`no fixture route for ${url}`);
    },
  };
}

function post(overrides: Partial<RedditPost> = {}): RedditPost {
  return {
    id: "t3_x",
    title: "hello",
    selftext: "",
    author: "a",
    ups: 1,
    numComments: 1,
    createdUtc: 0,
    subreddit: "test",
    crosspostParentId: null,
    stickied: false,
    permalink: "/r/test/1",
    accountAgeUnknown: true,
    outboundLinkCount: 0,
    evidenceId: "ev1",
    ...overrides,
  };
}

describe("collectors: reddit noise filters", () => {
  it("flags stickied, bot-authored, mega-thread, and multi-link posts as noise", () => {
    expect(isNoise(post({ stickied: true }))).toBe(true);
    expect(isNoise(post({ author: "totally_a_bot" }))).toBe(true);
    expect(isNoise(post({ title: "Weekly self-promo megathread" }))).toBe(true);
    expect(isNoise(post({ outboundLinkCount: 2 }))).toBe(true);
    expect(isNoise(post())).toBe(false);
  });
});

describe("collectors: reddit crosspost dedup", () => {
  it("collapses crossposts to their parent id", () => {
    const posts = [
      post({ id: "t3_a", crosspostParentId: null }),
      post({ id: "t3_b", crosspostParentId: "t3_a" }),
      post({ id: "t3_c", crosspostParentId: null }),
    ];
    expect(dedupeCrossposts(posts).map((p) => p.id)).toEqual(["t3_a", "t3_c"]);
  });
});

describe("collectors: RedditClient.collect", () => {
  it("discovers subreddits above MIN_SUBSCRIBERS, filters noise, and dedupes posts", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "invoice reminders for freelancers" }).run();

    const client = new RedditClient({ userAgent: "IdeaForge/test", httpClient: fixtureHttpClient() });
    const result = await client.collect(db, ideaId, ["invoicing"]);

    // "tinyhobby" (200 subscribers) is below MIN_SUBSCRIBERS and must be excluded.
    expect(result.subreddits).not.toContain("tinyhobby");
    expect(result.subreddits.length).toBeGreaterThan(0);
    expect(result.subreddits.length).toBeLessThanOrEqual(8);

    // Only the genuine pain post survives; the stickied megathread and the bot/multi-link post are noise.
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]?.id).toBe("t3_abc111");
  });

  it("hits the evidence cache on a second collect() for the same idea (no duplicate HTTP calls)", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "invoice reminders for freelancers" }).run();

    let calls = 0;
    const countingHttp: HttpClient = {
      async getJson(url: string) {
        calls += 1;
        return fixtureHttpClient().getJson(url);
      },
    };
    const client = new RedditClient({ userAgent: "IdeaForge/test", httpClient: countingHttp });

    await client.collect(db, ideaId, ["invoicing"]);
    const callsAfterFirst = calls;
    await client.collect(db, ideaId, ["invoicing"]);
    expect(calls).toBe(callsAfterFirst); // every request was already cached
  });
});
