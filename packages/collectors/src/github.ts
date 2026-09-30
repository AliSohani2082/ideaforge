import type { IdeaForgeDb } from "@ideaforge/core";

import { fetchAndCache } from "./cache.js";
import { createHttpClient } from "./http.js";
import type { HttpClient } from "./http.js";

export const MAX_REPOS = 20;
/** Repos whose name shares more than this fraction of tokens with an already-counted repo collapse
 * into it — a crude fork-farm dedup (§3 failure mode #3 of nora's spec). */
export const NAME_TOKEN_OVERLAP_THRESHOLD = 0.8;

export interface GithubRepo {
  readonly id: string; // "owner/name"
  readonly fullName: string;
  readonly description: string;
  readonly htmlUrl: string;
  readonly stars: number;
  readonly pushedAt: string;
  readonly topics: readonly string[];
  readonly license: string | null;
  readonly fork: boolean;
}

interface RawGithubSearchResponse {
  readonly items?: ReadonlyArray<Record<string, unknown>>;
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function parseRepo(raw: Record<string, unknown>): GithubRepo {
  const license = raw.license as Record<string, unknown> | null | undefined;
  return {
    id: asString(raw.full_name),
    fullName: asString(raw.full_name),
    description: asString(raw.description),
    htmlUrl: asString(raw.html_url),
    stars: asNumber(raw.stargazers_count),
    pushedAt: asString(raw.pushed_at),
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t): t is string => typeof t === "string") : [],
    license: license ? asString(license.spdx_id) || null : null,
    fork: raw.fork === true,
  };
}

function nameTokens(fullName: string): Set<string> {
  const name = fullName.split("/")[1] ?? fullName;
  return new Set(name.toLowerCase().split(/[-_.\s]+/).filter(Boolean));
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return shared / Math.max(a.size, b.size);
}

/** Forks of an already-counted repo, or near-duplicate names, collapse into one row (§3 failure mode #3). */
export function dedupeRepos(repos: readonly GithubRepo[]): GithubRepo[] {
  const kept: GithubRepo[] = [];
  for (const repo of repos) {
    const duplicate = kept.some((k) => {
      if (repo.fork && repo.description === k.description) return true;
      return tokenOverlap(nameTokens(repo.fullName), nameTokens(k.fullName)) > NAME_TOKEN_OVERLAP_THRESHOLD;
    });
    if (!duplicate) kept.push(repo);
  }
  return kept;
}

export function lastReleaseAgeDays(pushedAt: string, now: number = Date.now()): number | null {
  const pushedMs = Date.parse(pushedAt);
  if (Number.isNaN(pushedMs)) return null;
  return Math.max(0, Math.round((now - pushedMs) / 86_400_000));
}

export interface GithubClientOptions {
  readonly userAgent: string;
  readonly token?: string;
  readonly minIntervalMs?: number;
  readonly httpClient?: HttpClient;
}

export interface GithubCollectionResult {
  readonly repos: GithubRepo[];
  /** Set when running unauthenticated and GitHub's rate limit was hit — degrade, don't crash (per
   * the "fail visibly, degrade gracefully" lens). */
  readonly rateLimitMessage: string | null;
  /** The evidence row the search response was cached into (null if collection failed). */
  readonly evidenceId: string | null;
}

/** The collector seam `@ideaforge/cli` orchestrates against — lets tests inject a stub without
 * depending on `GithubClient`'s private HTTP plumbing. */
export interface GithubCollector {
  collect(db: IdeaForgeDb, ideaId: string, coreKeywords: readonly string[]): Promise<GithubCollectionResult>;
}

export class GithubClient implements GithubCollector {
  private readonly http: HttpClient;
  private readonly token: string | undefined;

  constructor(options: GithubClientOptions) {
    this.token = options.token ?? process.env.GITHUB_TOKEN;
    this.http =
      options.httpClient ??
      createHttpClient({
        userAgent: options.userAgent,
        minIntervalMs: options.minIntervalMs ?? (this.token ? 200 : 2500),
        headers: {
          Accept: "application/vnd.github+json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
  }

  async collect(db: IdeaForgeDb, ideaId: string, coreKeywords: readonly string[]): Promise<GithubCollectionResult> {
    const query = coreKeywords.map((k) => `${k} in:name,description,readme`).join(" OR ") || "in:name";
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${MAX_REPOS}`;

    let rateLimitMessage: string | null = null;
    let repos: GithubRepo[] = [];
    let evidenceId: string | null = null;
    try {
      const result = await fetchAndCache({
        db,
        ideaId,
        source: "github",
        kind: "github_repo_search",
        url,
        fetchFn: () => this.http.getJson(url),
      });
      evidenceId = result.evidenceId;
      const items = (result.data as RawGithubSearchResponse)?.items ?? [];
      repos = dedupeRepos(items.map(parseRepo));
    } catch (error) {
      if (!this.token) {
        rateLimitMessage =
          "GitHub collection failed without a token (likely rate-limited). Set GITHUB_TOKEN to raise the limit; " +
          `this idea's competition/readiness scores are based on whatever evidence was already cached. (${String(error)})`;
      } else {
        throw error;
      }
    }

    return { repos, rateLimitMessage, evidenceId };
  }
}
