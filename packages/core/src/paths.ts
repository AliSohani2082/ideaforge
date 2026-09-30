import { join } from "node:path";

/**
 * IdeaForge is one portable `ideaforge.db` file in the current working directory by default —
 * anything that needs external infrastructure to run locally is a design smell. `IDEAFORGE_DB_PATH`
 * overrides it for tests and multi-project setups.
 */
export function resolveDbPath(cwd = process.cwd()): string {
  return process.env.IDEAFORGE_DB_PATH ?? join(cwd, "ideaforge.db");
}
