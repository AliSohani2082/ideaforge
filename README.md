# IdeaForge

IdeaForge is an open-source, self-hostable CLI and agent harness that takes a business idea as
input, gathers real evidence about demand and competitors, scores the idea with deterministic
formulas, stores everything in SQLite, and reports back. It runs from the command line, from an
MCP client, or from a local dashboard.

## Why it's token-cheap

IdeaForge is built around a hard cost constraint: it has to run affordably on a personal Claude
subscription. That shapes the architecture, not just the prompts:

- **Collectors never call an LLM.** Reddit, GitHub, Product Hunt and HN evidence is fetched over
  plain HTTP and cached in SQLite. The model never browses the web.
- **The model does exactly one job: extraction into a JSON schema.** Pain points, competitor
  features, pricing — never open-ended analysis where a schema would do.
- **Scores are computed in code, not by the model.** Deterministic formulas run over cached
  evidence, so re-scoring the same evidence always costs zero tokens.
- **Every pipeline step is content-addressed and resumable.** A step's cache key is a hash of its
  inputs. Re-running an evaluation replays cached steps; only new or invalidated steps spend
  tokens.
- **The LLM provider is pluggable.** `claude-code` (shells out to the Claude Code CLI, using the
  subscription, no per-token cost) is the default; `openrouter` is an optional fallback.

## Project layout

```
packages/core         domain model + SQLite schema (Drizzle + better-sqlite3)
packages/collectors    HTTP evidence collectors (no LLM)
packages/harness       resumable step DAG + pluggable LLM provider
packages/scoring       deterministic scoring functions
packages/cli           the `ideaforge` binary
packages/mcp           MCP server
apps/dashboard         Next.js dashboard
```

This is a pnpm workspace. Every package builds independently; the CLI and dashboard consume the
same domain model from `packages/core` so there is one schema and one set of types shared across
every surface.

## Running it

Requirements: Node 20+, pnpm (see `packageManager` in `package.json`), and either the
[Claude Code CLI](https://docs.claude.com/en/docs/claude-code) logged into a subscription
(default provider), or an OpenRouter API key (`OPENROUTER_API_KEY`, fallback provider via
`IDEAFORGE_PROVIDER=openrouter`).

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# run the CLI (writes ./ideaforge.db and ./ideaforge-reports/<idea-id>.md in the cwd)
node packages/cli/dist/index.js init
node packages/cli/dist/index.js eval "A tool that chases late-paying freelance clients automatically"
node packages/cli/dist/index.js report <idea-id>
node packages/cli/dist/index.js db path
```

IdeaForge stores its data in a single SQLite file (`ideaforge.db` by default) — there is no
external infrastructure to stand up to run it locally.

Optional environment variables:

- `GITHUB_TOKEN` — raises the GitHub search rate limit; the collector degrades to unauthenticated
  with a clear message if unset.
- `IDEAFORGE_REDDIT_USER_AGENT` — a descriptive Reddit User-Agent; Reddit needs one even
  unauthenticated.
- `IDEAFORGE_PROVIDER` — `claude-code` (default) or `openrouter`.
- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — used only when `IDEAFORGE_PROVIDER=openrouter`.

## Status

**v0 implemented** (see `ALIA-4`): the full `ideaforge eval "<idea>"` pipeline — domain model,
Reddit + GitHub collectors, the resumable/content-addressed harness, all five deterministic scores
plus the verdict rollup, and the CLI commands (`init`, `idea add`, `eval`, `report`, `db path`).
Re-running `eval` on the same idea statement makes zero LLM calls (content-addressed step cache)
and zero HTTP calls (evidence cache).

Deliberately out of scope for v0: Product Hunt and Hacker News collectors, the MCP server, the
Next.js dashboard, and the Paperclip plugin — the seams for all four exist (`packages/core`'s
schema, `packages/collectors`' collector interfaces) but nothing beyond that is built yet. Margin
scoring currently has no pricing-page collector, so it typically reports its neutral no-data
default until one is added.

## License

[MIT](./LICENSE)
