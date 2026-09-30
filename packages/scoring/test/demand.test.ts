import { describe, expect, it } from "vitest";

import { MIN_CLUSTER_POSTS, clusterScore, demandConfidence, demandScore } from "../src/demand.js";
import type { Cluster } from "../src/types.js";

const NOW = 1_000_000 * 86400; // arbitrary "now" in seconds, aligned to a day boundary

function post(overrides: Partial<Cluster["posts"][number]> = {}) {
  return { ups: 10, numComments: 5, createdUtc: NOW, author: "author-1", ...overrides };
}

describe("scoring: demand", () => {
  it("gates clusters below the noise floor (MIN_CLUSTER_POSTS) to zero", () => {
    const cluster: Cluster = {
      posts: Array.from({ length: MIN_CLUSTER_POSTS - 1 }, (_, i) => post({ author: `a${i}` })),
      workaroundMentionCount: 0,
    };
    expect(clusterScore(cluster, NOW)).toBe(0);
    expect(demandScore([cluster], NOW)).toBe(0);
  });

  it("scores a qualifying cluster with full author diversity and no workaround mentions", () => {
    const cluster: Cluster = {
      posts: [post({ author: "a" }), post({ author: "b" }), post({ author: "c" })],
      workaroundMentionCount: 0,
    };
    expect(clusterScore(cluster, NOW)).toBeCloseTo(14.2557, 3);
    expect(demandScore([cluster], NOW)).toBeCloseTo(29.9803, 3);
  });

  it("dampens a single-author cluster to the 0.5 floor and applies the full workaround bonus", () => {
    const cluster: Cluster = {
      posts: [post({ ups: 20, numComments: 10 }), post({ ups: 20, numComments: 10 }), post({ ups: 20, numComments: 10 })],
      workaroundMentionCount: 3, // every post mentions a paid workaround -> bonus capped at 1.5x
    };
    expect(clusterScore(cluster, NOW)).toBeCloseTo(18.3661, 3);
    expect(demandScore([cluster], NOW)).toBeCloseTo(36.8181, 3);
  });

  it("decays a post's contribution with age via the recency half-life", () => {
    const fresh: Cluster = {
      posts: [post({ createdUtc: NOW }), post({ createdUtc: NOW }), post({ createdUtc: NOW })],
      workaroundMentionCount: 0,
    };
    const halfLifeOld = NOW - 60 * 86400; // exactly one half-life (60 days) old
    const stale: Cluster = {
      posts: [
        post({ createdUtc: halfLifeOld }),
        post({ createdUtc: halfLifeOld }),
        post({ createdUtc: halfLifeOld }),
      ],
      workaroundMentionCount: 0,
    };
    expect(clusterScore(stale, NOW)).toBeCloseTo(clusterScore(fresh, NOW) * 0.5, 6);
  });

  it("bounds the score in (0,100) and never lets a single cluster saturate it", () => {
    const hugeCluster: Cluster = {
      posts: Array.from({ length: 50 }, (_, i) => post({ author: `a${i}`, ups: 5000, numComments: 2000 })),
      workaroundMentionCount: 50,
    };
    const score = demandScore([hugeCluster], NOW);
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(90);
  });

  it("reports zero-signal state distinctly (score 0, confidence low) rather than implying validation", () => {
    expect(demandScore([], NOW)).toBe(0);
    expect(demandConfidence(0, 0, 0)).toBe("low");
  });

  it.each([
    { qualifyingClusters: 3, distinctAuthors: 10, distinctSubreddits: 2, expected: "high" },
    { qualifyingClusters: 2, distinctAuthors: 10, distinctSubreddits: 1, expected: "medium" },
    { qualifyingClusters: 1, distinctAuthors: 5, distinctSubreddits: 1, expected: "medium" },
    { qualifyingClusters: 1, distinctAuthors: 2, distinctSubreddits: 1, expected: "low" },
  ] as const)(
    "demandConfidence($qualifyingClusters, $distinctAuthors, $distinctSubreddits) -> $expected",
    ({ qualifyingClusters, distinctAuthors, distinctSubreddits, expected }) => {
      expect(demandConfidence(qualifyingClusters, distinctAuthors, distinctSubreddits)).toBe(expected);
    },
  );
});
