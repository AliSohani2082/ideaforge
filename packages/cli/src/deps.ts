import { mkdirSync, writeFileSync } from "node:fs";

import { createDb, resolveDbPath } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import { createLlmProvider } from "@ideaforge/harness";
import type { LlmProvider } from "@ideaforge/harness";

/** Injectable seams so commands are testable without touching a real DB/provider/filesystem. */
export interface CliDeps {
  readonly openDb: (path?: string) => IdeaForgeDb;
  readonly resolveDbPath: () => string;
  readonly createProvider: () => LlmProvider;
  readonly writeFile: (path: string, content: string) => void;
  readonly mkdirSync: (path: string) => void;
  readonly cwd: () => string;
}

export function createDefaultDeps(): CliDeps {
  return {
    openDb: (path) => createDb(path ?? resolveDbPath()),
    resolveDbPath: () => resolveDbPath(),
    createProvider: () => createLlmProvider(),
    writeFile: (path, content) => writeFileSync(path, content, "utf-8"),
    mkdirSync: (path) => mkdirSync(path, { recursive: true }),
    cwd: () => process.cwd(),
  };
}
