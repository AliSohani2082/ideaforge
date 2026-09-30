import type { Cluster, Tier } from "./types.js";

/** Formulas and constants are the literal spec from nora's `plan` document, §2. */
export const RECENCY_HALF_LIFE_DAYS = 60;
export const WORKAROUND_BONUS_WEIGHT = 0.5;
export const MIN_CLUSTER_POSTS = 3;
export const DEMAND_SATURATION_K = 40;

export function postScore(ups: number, numComments: number, createdUtc: number, now: number): number {
  const ageDays = (now - createdUtc) / 86400;
  const recencyWeight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  // Upvotes weighted 2x comments: upvotes are low-effort agreement, comments are noisier.
  const engagementWeight = Math.log2(1 + ups) + 0.5 * Math.log2(1 + numComments);
  return recencyWeight * engagementWeight;
}

export function clusterScore(cluster: Cluster, now: number): number {
  if (cluster.posts.length < MIN_CLUSTER_POSTS) return 0; // noise floor gate
  const raw = cluster.posts.reduce((s, p) => s + postScore(p.ups, p.numComments, p.createdUtc, now), 0);
  const distinctAuthors = new Set(cluster.posts.map((p) => p.author)).size;
  const authorDiversityFactor = distinctAuthors / cluster.posts.length; // in (0,1]
  // Floor 0.5 so one honest single-author signal still counts at half.
  const dampened = raw * (0.5 + 0.5 * authorDiversityFactor);
  const workaroundBonus =
    1 + WORKAROUND_BONUS_WEIGHT * Math.min(cluster.workaroundMentionCount / cluster.posts.length, 1);
  return dampened * workaroundBonus;
}

export function demandScore(clusters: readonly Cluster[], now: number = Date.now()): number {
  const total = clusters.reduce((s, c) => s + clusterScore(c, now), 0);
  // Smooth, bounded (0,100) — no single cluster can saturate it alone.
  return 100 * (1 - Math.exp(-total / DEMAND_SATURATION_K));
}

export function demandConfidence(
  qualifyingClusters: number,
  distinctAuthors: number,
  distinctSubreddits: number,
): Tier {
  if (qualifyingClusters >= 3 && distinctSubreddits >= 2 && distinctAuthors >= 10) return "high";
  if (qualifyingClusters >= 1 && distinctAuthors >= 5) return "medium";
  return "low";
}
