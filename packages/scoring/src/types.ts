export type Tier = "low" | "medium" | "high";

export const TIER_RANK: Record<Tier, number> = { low: 0, medium: 1, high: 2 };

export interface Post {
  readonly ups: number;
  readonly numComments: number;
  readonly createdUtc: number;
  readonly author: string;
}

export interface Cluster {
  readonly posts: Post[];
  readonly workaroundMentionCount: number;
}

export type CompetitorType = "DIRECT" | "ADJACENT" | "DIY_STATUS_QUO";

export interface ScoredCompetitor {
  readonly competitorType: CompetitorType;
  readonly isOpenSource: boolean;
  readonly githubStars: number | null;
  readonly lastReleaseAgeDays: number | null;
  readonly discoveredVia: readonly string[];
}

export interface PricePoint {
  readonly monthlyPriceUsd: number | null;
  readonly isFreeTier: boolean;
  readonly competitorId: string;
}

export type DeliveryModel =
  | "SELF_SERVE_SAAS"
  | "DONE_FOR_YOU_SERVICE"
  | "MARKETPLACE_TAKE_RATE"
  | "ONE_TIME_PURCHASE";

export const INTEGRATIONS = [
  "PAYMENTS",
  "CALENDAR",
  "EMAIL_SENDING",
  "SMS",
  "EMAIL_INBOUND_PARSING",
  "OAUTH_LOGIN",
  "FILE_STORAGE",
  "MAPS_GEO",
  "VIDEO",
  "OTHER",
] as const;

export type Integration = (typeof INTEGRATIONS)[number];

export interface ComplexityExtraction {
  readonly integrations: readonly Integration[];
  readonly requiresRealtime: boolean;
  readonly requiresMobileApp: boolean;
  readonly requiresRegulatedData: boolean;
  readonly requiresMLModel: boolean;
  readonly requiresTwoSidedMarketplace: boolean;
}

export interface Score {
  readonly value: number;
  readonly confidence: Tier;
}

export type DemandScoreResult = Score | { readonly notCollected: true };

export type Verdict =
  | "NOT_COLLECTED"
  | "NO_SIGNAL"
  | "TOO_COMPLEX_FOR_WEDGE"
  | "CROWDED_BUT_VALIDATED"
  | "STRONG_WEDGE"
  | "WORTH_TESTING";

/** "Still alive" cutoff shared by Competition and Readiness (§3, §6 of nora's spec). */
export const ACTIVE_WINDOW_DAYS = 180;
