import { createDb, ideas, newId } from "@ideaforge/core";
import { describe, expect, it } from "vitest";

import { GithubClient, dedupeRepos, lastReleaseAgeDays } from "../src/github.js";
import type { GithubRepo } from "../src/github.js";
import type { HttpClient } from "../src/http.js";

import githubSearchFixture from "./fixtures/github-search.json" with { type: "json" };

function fixtureHttpClient(): HttpClient {
  return {
    async getJson() {
      return githubSearchFixture;
    },
  };
}

function repo(overrides: Partial<GithubRepo> = {}): GithubRepo {
  return {
    id: "a/b",
    fullName: "a/b",
    description: "desc",
    htmlUrl: "https://github.com/a/b",
    stars: 10,
    pushedAt: "2026-01-01T00:00:00Z",
    topics: [],
    license: null,
    fork: false,
    ...overrides,
  };
}

describe("collectors: github repo dedup", () => {
  it("collapses a fork with the same description into its parent repo", () => {
    const parent = repo({ fullName: "acme/tool" });
    const fork = repo({ fullName: "someone/tool-fork", fork: true, description: parent.description });
    expect(dedupeRepos([parent, fork])).toHaveLength(1);
  });

  it("collapses an unofficial mirror with an identical repo name under a different owner", () => {
    const original = repo({ fullName: "acme/invoice-ninja", description: "d1" });
    const mirror = repo({ fullName: "acme-mirror/invoice-ninja", description: "d2" });
    expect(dedupeRepos([original, mirror])).toHaveLength(1);
  });

  it("keeps genuinely distinct repos", () => {
    const a = repo({ fullName: "acme/invoice-tool" });
    const b = repo({ fullName: "other/expense-tracker" });
    expect(dedupeRepos([a, b])).toHaveLength(2);
  });
});

describe("collectors: lastReleaseAgeDays", () => {
  it("computes whole days since the last push", () => {
    const now = Date.parse("2026-09-30T00:00:00Z");
    expect(lastReleaseAgeDays("2026-09-29T00:00:00Z", now)).toBe(1);
  });

  it("returns null for an unparsable date", () => {
    expect(lastReleaseAgeDays("not-a-date")).toBeNull();
  });
});

describe("collectors: GithubClient.collect", () => {
  it("fetches, dedupes the fork, and caches into evidence", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "invoice reminders for freelancers" }).run();

    const client = new GithubClient({ userAgent: "IdeaForge/test", httpClient: fixtureHttpClient() });
    const result = await client.collect(db, ideaId, ["invoicing"]);

    expect(result.rateLimitMessage).toBeNull();
    // The fixture has 3 repos but one is a same-description fork -> collapses to 2.
    expect(result.repos).toHaveLength(2);
    expect(result.repos.map((r) => r.fullName)).toContain("invoiceninja/invoiceninja");
  });

  it("degrades with a clear message instead of throwing when unauthenticated collection fails", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "invoice reminders for freelancers" }).run();

    const failingHttp: HttpClient = {
      async getJson() {
        throw new Error("403 rate limited");
      },
    };
    // Explicit empty string, not undefined: guarantees the "no token" path even if the CI
    // environment happens to export a GITHUB_TOKEN (GitHub Actions does this by default).
    const client = new GithubClient({ userAgent: "IdeaForge/test", httpClient: failingHttp, token: "" });
    const result = await client.collect(db, ideaId, ["invoicing"]);

    expect(result.repos).toEqual([]);
    expect(result.rateLimitMessage).toMatch(/GITHUB_TOKEN/);
  });
});
