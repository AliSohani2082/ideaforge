import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { LlmProvider } from "../provider.js";
import { extractJson } from "./json-extract.js";

const execFileAsync = promisify(execFile);

function buildPrompt(prompt: string, jsonSchema: Record<string, unknown>): string {
  return [
    prompt,
    "",
    "Respond with ONLY a single JSON value matching this JSON Schema — no prose, no markdown fences:",
    JSON.stringify(jsonSchema),
  ].join("\n");
}

export interface ClaudeCodeProviderOptions {
  /** Binary name/path for the Claude Code CLI. Overridable for tests and non-standard installs. */
  readonly bin?: string;
  readonly timeoutMs?: number;
}

/**
 * Default provider: shells out to the Claude Code CLI in non-interactive print mode. This spends
 * from the owner's existing Claude subscription, not per-token API billing.
 */
export function createClaudeCodeProvider(options: ClaudeCodeProviderOptions = {}): LlmProvider {
  const bin = options.bin ?? process.env.IDEAFORGE_CLAUDE_BIN ?? "claude";
  const timeout = options.timeoutMs ?? 120_000;

  return {
    name: "claude-code",
    async complete(prompt, jsonSchema) {
      const fullPrompt = buildPrompt(prompt, jsonSchema);
      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(bin, ["-p", fullPrompt], {
          timeout,
          maxBuffer: 10 * 1024 * 1024,
        }));
      } catch (error) {
        throw new Error(
          `Claude Code CLI ("${bin}") failed. Is it installed and on PATH? Original error: ${String(error)}`,
        );
      }
      return extractJson(stdout);
    },
  };
}
