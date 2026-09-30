import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export type IdeaForgeDb = BetterSQLite3Database<typeof schema>;

/**
 * Opens (creating if needed) a single SQLite file as the whole persistence layer — no external
 * infrastructure required to self-host IdeaForge. Pass ":memory:" for tests.
 */
export function createDb(path = "ideaforge.db"): IdeaForgeDb {
  const sqlite = new Database(path);
  if (path !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ideas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
  `);
  return drizzle(sqlite, { schema });
}
