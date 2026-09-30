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

Requirements: Node 20+, pnpm (see `packageManager` in `package.json`).

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# run the CLI
node packages/cli/dist/index.js --help
```

IdeaForge stores its data in a single SQLite file (`ideaforge.db` by default) — there is no
external infrastructure to stand up to run it locally.

## Status

This repository currently contains the monorepo scaffold and CI only: domain model wiring,
tooling, and placeholder packages for collectors, the harness, scoring, the CLI, the MCP server,
and the dashboard. Collectors, scoring formulas, and the harness's step executor are implemented
in follow-up work.

## License

[MIT](./LICENSE)
