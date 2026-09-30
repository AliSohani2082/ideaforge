import type { LlmProvider, LlmProviderName } from "../provider.js";
import { createClaudeCodeProvider } from "./claude-code.js";
import { createOpenRouterProvider } from "./openrouter.js";

/**
 * Resolves the configured provider. Defaults to `claude-code` (the owner's subscription, no
 * per-token cost); `IDEAFORGE_PROVIDER=openrouter` switches to the metered fallback.
 */
export function createLlmProvider(name?: LlmProviderName): LlmProvider {
  const resolved = name ?? (process.env.IDEAFORGE_PROVIDER as LlmProviderName | undefined) ?? "claude-code";
  switch (resolved) {
    case "openrouter":
      return createOpenRouterProvider();
    case "claude-code":
      return createClaudeCodeProvider();
    default:
      throw new Error(`Unknown IDEAFORGE_PROVIDER "${String(resolved)}" — expected "claude-code" or "openrouter"`);
  }
}
