import { createDb } from "@ideaforge/core";
import type { IdeaForgeDb } from "@ideaforge/core";
import { createStubProvider } from "@ideaforge/harness";
import { describe, expect, it } from "vitest";

import type { CliDeps } from "../src/deps.js";
import { runCli } from "../src/cli.js";

function createTestDeps(overrides: Partial<CliDeps> = {}): CliDeps & { writtenFiles: Map<string, string> } {
  const db: IdeaForgeDb = createDb(":memory:");
  const writtenFiles = new Map<string, string>();
  return {
    openDb: () => db,
    resolveDbPath: () => "/tmp/ideaforge-test.db",
    createProvider: () => createStubProvider(() => ({})),
    writeFile: (path, content) => writtenFiles.set(path, content),
    mkdirSync: () => undefined,
    cwd: () => "/tmp/ideaforge-cwd",
    writtenFiles,
    ...overrides,
  };
}

describe("cli: init / idea add / db path", () => {
  it("init reports the resolved db path", async () => {
    const deps = createTestDeps();
    const result = await runCli(["init"], "1.0.0", deps);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("/tmp/ideaforge-test.db");
  });

  it("db path prints the resolved path", async () => {
    const deps = createTestDeps();
    const result = await runCli(["db", "path"], "1.0.0", deps);
    expect(result.output).toBe("/tmp/ideaforge-test.db");
  });

  it("idea add requires a statement", async () => {
    const deps = createTestDeps();
    const result = await runCli(["idea", "add"], "1.0.0", deps);
    expect(result.exitCode).toBe(1);
  });

  it("idea add creates an idea and returns its id", async () => {
    const deps = createTestDeps();
    const result = await runCli(["idea", "add", "a", "tool", "that", "helps"], "1.0.0", deps);
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Idea [0-9a-f-]+/);
  });

  it("report on an unknown idea id exits non-zero", async () => {
    const deps = createTestDeps();
    const result = await runCli(["report", "does-not-exist"], "1.0.0", deps);
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/No idea found/);
  });

  it("eval requires a statement", async () => {
    const deps = createTestDeps();
    const result = await runCli(["eval"], "1.0.0", deps);
    expect(result.exitCode).toBe(1);
  });
});
