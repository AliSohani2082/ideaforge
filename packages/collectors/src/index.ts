/**
 * Evidence collectors are plain HTTP + cache-to-SQLite — they never call an LLM. Reddit and GitHub
 * are v0's two sources; Product Hunt and Hacker News are out of scope here (see ALIA-4).
 */
export const COLLECTOR_SOURCES = ["reddit", "github"] as const;
export type CollectorSource = (typeof COLLECTOR_SOURCES)[number];

export * from "./http.js";
export * from "./cache.js";
export * from "./reddit.js";
export * from "./github.js";
