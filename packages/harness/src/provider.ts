/**
 * The LLM provider is pluggable: "claude-code" shells out to the Claude Code CLI and uses the
 * owner's subscription (no per-token cost); "openrouter" is an optional metered fallback. Every
 * step calls a provider through this interface only — never a hard-coded SDK client.
 */
export type LlmProviderName = "claude-code" | "openrouter";

export interface LlmProvider {
  readonly name: LlmProviderName;
  /** Extracts model output into the given JSON schema. The model's only job — never free-form prose. */
  complete(prompt: string, jsonSchema: Record<string, unknown>): Promise<unknown>;
}
