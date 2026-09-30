import type { IdeaForgeDb } from "@ideaforge/core";

import { fetchAndCache } from "./cache.js";
import { createHttpClient } from "./http.js";
import type { HttpClient } from "./http.js";

/** Reddit signal design constants — the literal spec from nora's `plan` document, §8. */
export const KEYWORD_SEED_COUNT = 5;
export const MIN_SUBSCRIBERS = 1000;
export const TRAVERSAL_SUBREDDIT_CAP = 3;
export const MAX_SUBREDDITS = 8;
export const MAX_QUERIES_PER_SUBREDDIT = 4;

export const PAIN_PHRASE_TEMPLATES = [
  "I wish there was {X}",
  "why is there no {X}",
  "anyone know a tool that {X}",
  "anyone know an app that {X}",
  "sick of {X}",
  "is there an alternative to {X}",
  "how do you all deal with {X}",
  "{X} is such a pain",
] as const;

export interface RedditPost {
  readonly id: string; // Reddit fullname, e.g. t3_abc123
  readonly title: string;
  readonly selftext: string;
  readonly author: string;
  readonly ups: number;
  readonly numComments: number;
  readonly createdUtc: number;
  readonly subreddit: string;
  readonly crosspostParentId: string | null;
  readonly stickied: boolean;
  readonly permalink: string;
  readonly accountAgeUnknown: true; // Reddit's public search JSON doesn't expose account age
  readonly outboundLinkCount: number;
  /** The evidence row this post was first observed in — provenance back to the raw response. */
  readonly evidenceId: string;
}

interface RedditThingListing {
  readonly data?: {
    readonly children?: ReadonlyArray<{ readonly data?: Record<string, unknown> }>;
  };
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asNumber(v: unknown, fallback = 0): number {
  return typeof v === "number" ? v : fallback;
}

function parsePost(raw: Record<string, unknown>, evidenceId: string): RedditPost {
  const selftext = asString(raw.selftext);
  const bodyLinkCount = (selftext.match(/https?:\/\//g) ?? []).length;
  const crosspostParents = raw.crosspost_parent_list;
  const crosspostParentId =
    Array.isArray(crosspostParents) && crosspostParents.length > 0
      ? asString((crosspostParents[0] as Record<string, unknown>)?.name) || null
      : asString(raw.crosspost_parent) || null;

  return {
    id: asString(raw.name),
    title: asString(raw.title),
    selftext,
    author: asString(raw.author),
    ups: asNumber(raw.ups),
    numComments: asNumber(raw.num_comments),
    createdUtc: asNumber(raw.created_utc),
    subreddit: asString(raw.subreddit).toLowerCase(),
    crosspostParentId,
    stickied: raw.stickied === true,
    permalink: asString(raw.permalink),
    accountAgeUnknown: true,
    outboundLinkCount: bodyLinkCount,
    evidenceId,
  };
}

/** Bots, mega-threads, and stickied posts — code-only, no LLM (§8.5). */
const BOT_AUTHOR = /bot$/i;
const MEGATHREAD_TITLE = /^weekly|megathread|self.?promo/i;

export function isNoise(post: RedditPost): boolean {
  if (post.stickied) return true;
  if (BOT_AUTHOR.test(post.author)) return true;
  if (MEGATHREAD_TITLE.test(post.title)) return true;
  // Self-promotion heuristic: v0 can't check account age from public search JSON, so this uses the
  // one signal it does have — multiple outbound links in the body reads as a promo post.
  if (post.outboundLinkCount >= 2) return true;
  return false;
}

/** Crossposts collapse to their parent post id so a repost farm can't inflate a cluster (§8.4). */
export function dedupeCrossposts(posts: readonly RedditPost[]): RedditPost[] {
  const seen = new Set<string>();
  const result: RedditPost[] = [];
  for (const post of posts) {
    const key = post.crosspostParentId ?? post.id;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(post);
  }
  return result;
}

interface SubredditCandidate {
  readonly name: string;
  readonly subscribers: number;
}

function parseSubredditSearchResults(listing: unknown): SubredditCandidate[] {
  const children = (listing as RedditThingListing)?.data?.children ?? [];
  return children
    .map((c) => c.data)
    .filter((d): d is Record<string, unknown> => Boolean(d))
    .map((d) => ({ name: asString(d.display_name).toLowerCase(), subscribers: asNumber(d.subscribers) }))
    .filter((c) => c.name.length > 0);
}

export interface RedditClientOptions {
  readonly userAgent: string;
  readonly minIntervalMs?: number;
  readonly httpClient?: HttpClient;
  /** A Reddit OAuth "script" app access token, if the owner has provisioned one (§8.7 of nora's
   * spec — not required for v0, but the client is structured to accept it without touching call
   * sites). Defaults to `REDDIT_ACCESS_TOKEN` from the environment; unset means fully unauthenticated. */
  readonly accessToken?: string;
}

export interface RedditCollectionResult {
  readonly subreddits: string[];
  readonly posts: RedditPost[];
}

/** The collector seam `@ideaforge/cli` orchestrates against — lets tests inject a stub without
 * depending on `RedditClient`'s private HTTP plumbing. */
export interface RedditCollector {
  collect(db: IdeaForgeDb, ideaId: string, coreKeywords: readonly string[]): Promise<RedditCollectionResult>;
}

export class RedditClient implements RedditCollector {
  private readonly http: HttpClient;
  private readonly baseUrl: string;

  constructor(options: RedditClientOptions) {
    const accessToken = options.accessToken ?? process.env.REDDIT_ACCESS_TOKEN;
    this.baseUrl = accessToken ? "https://oauth.reddit.com" : "https://www.reddit.com";
    this.http =
      options.httpClient ??
      createHttpClient({
        userAgent: options.userAgent,
        minIntervalMs: options.minIntervalMs ?? 1100,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });
  }

  private async searchSubreddits(db: IdeaForgeDb, ideaId: string, keyword: string): Promise<SubredditCandidate[]> {
    const url = `${this.baseUrl}/subreddits/search.json?q=${encodeURIComponent(keyword)}&limit=15`;
    const { data } = await fetchAndCache({
      db,
      ideaId,
      source: "reddit",
      kind: "reddit_subreddit_search",
      url,
      fetchFn: () => this.http.getJson(url),
    });
    return parseSubredditSearchResults(data);
  }

  private async searchInSubreddit(
    db: IdeaForgeDb,
    ideaId: string,
    subreddit: string,
    query: string,
  ): Promise<RedditPost[]> {
    const url = `${this.baseUrl}/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&t=year&limit=25`;
    const { data, evidenceId } = await fetchAndCache({
      db,
      ideaId,
      source: "reddit",
      kind: "reddit_search",
      url,
      fetchFn: () => this.http.getJson(url),
    });
    const children = (data as RedditThingListing)?.data?.children ?? [];
    return children
      .map((c) => c.data)
      .filter((d): d is Record<string, unknown> => Boolean(d))
      .map((d) => parsePost(d, evidenceId));
  }

  /** Primary keyword search + secondary crosspost-traversal subreddit discovery (§8.1). */
  private async discoverSubreddits(
    db: IdeaForgeDb,
    ideaId: string,
    coreKeywords: readonly string[],
  ): Promise<{ subreddits: string[]; seedPosts: RedditPost[] }> {
    const candidatesByName = new Map<string, SubredditCandidate>();
    for (const keyword of coreKeywords) {
      const results = await this.searchSubreddits(db, ideaId, keyword);
      for (const c of results) {
        if (c.subscribers < MIN_SUBSCRIBERS) continue;
        const existing = candidatesByName.get(c.name);
        if (!existing || existing.subscribers < c.subscribers) candidatesByName.set(c.name, c);
      }
    }
    const primary = [...candidatesByName.values()]
      .sort((a, b) => b.subscribers - a.subscribers)
      .slice(0, KEYWORD_SEED_COUNT)
      .map((c) => c.name);

    // Baseline query against each primary subreddit, used both as seed evidence and as the corpus
    // that crosspost traversal walks.
    const seedPosts: RedditPost[] = [];
    for (const sub of primary) {
      const posts = await this.searchInSubreddit(db, ideaId, sub, coreKeywords[0] ?? "");
      seedPosts.push(...posts);
    }

    // Co-occurrence traversal via the author-history channel (§8.1b): a candidate subreddit is
    // added only if it shows up >=2 times across the seed authors' post histories.
    const traversalCounts = new Map<string, number>();
    const authorsSeen = new Set<string>();
    for (const post of seedPosts) {
      if (authorsSeen.has(post.author) || post.author === "[deleted]") continue;
      authorsSeen.add(post.author);
      const url = `${this.baseUrl}/user/${encodeURIComponent(post.author)}/submitted.json?limit=25`;
      try {
        const { data } = await fetchAndCache({
          db,
          ideaId,
          source: "reddit",
          kind: "reddit_user_submitted",
          url,
          fetchFn: () => this.http.getJson(url),
        });
        const children = (data as RedditThingListing)?.data?.children ?? [];
        for (const child of children) {
          const sub = asString(child.data?.subreddit).toLowerCase();
          if (!sub || primary.includes(sub)) continue;
          traversalCounts.set(sub, (traversalCounts.get(sub) ?? 0) + 1);
        }
      } catch {
        // Per-user traversal is best-effort; a suspended/private account shouldn't fail collection.
      }
    }

    const traversal: string[] = [];
    for (const [sub, count] of [...traversalCounts.entries()].sort((a, b) => b[1] - a[1])) {
      if (traversal.length >= TRAVERSAL_SUBREDDIT_CAP) break;
      if (count < 2) continue; // must appear >=2 times across the seed set
      traversal.push(sub);
    }

    const subreddits = [...primary, ...traversal].slice(0, MAX_SUBREDDITS);
    return { subreddits, seedPosts };
  }

  private buildQueries(subreddit: string, coreKeywords: readonly string[]): string[] {
    const queries: string[] = [];
    const [first, ...rest] = coreKeywords;
    if (first) {
      for (const phrase of PAIN_PHRASE_TEMPLATES) {
        if (queries.length >= MAX_QUERIES_PER_SUBREDDIT - 1) break;
        queries.push(phrase.replace("{X}", first));
      }
    }
    for (const keyword of rest) {
      if (queries.length >= MAX_QUERIES_PER_SUBREDDIT - 1) break;
      queries.push(keyword);
    }
    if (first) queries.push(first); // plain-keyword volume baseline
    return queries.slice(0, MAX_QUERIES_PER_SUBREDDIT);
  }

  /** Runs full subreddit discovery + query construction + collection for one idea. */
  async collect(db: IdeaForgeDb, ideaId: string, coreKeywords: readonly string[]): Promise<RedditCollectionResult> {
    const { subreddits, seedPosts } = await this.discoverSubreddits(db, ideaId, coreKeywords);
    const allPosts = new Map<string, RedditPost>();
    for (const post of seedPosts) allPosts.set(post.id, post);

    for (const sub of subreddits) {
      const queries = this.buildQueries(sub, coreKeywords);
      for (const query of queries) {
        const posts = await this.searchInSubreddit(db, ideaId, sub, query);
        for (const post of posts) allPosts.set(post.id, post);
      }
    }

    const cleaned = dedupeCrossposts([...allPosts.values()].filter((p) => !isNoise(p)));
    return { subreddits, posts: cleaned };
  }
}
