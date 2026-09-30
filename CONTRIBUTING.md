# Contributing to IdeaForge

Thanks for your interest in contributing.

## Ground rules

- `main` is the merge target. All changes land via pull request — no direct pushes to `main`.
  Branch protection on `main` requires the CI check to pass and requires a pull request before
  merging.
- Before opening a PR, run locally what CI runs:

  ```bash
  pnpm install
  pnpm build
  pnpm typecheck
  pnpm lint
  pnpm test
  ```

- Keep PRs to a coherent, reviewable slice of work.
- New behavior needs a test. Deterministic scoring code in particular should have table-driven
  tests against fixed evidence fixtures.
- Respect the token-cost architecture described in the README: collectors never call an LLM,
  scores are deterministic code, and pipeline steps must stay content-addressed and resumable.

## Development

This is a pnpm workspace (`packages/*`, `apps/*`). See the root `README.md` for the package
layout and the commands above for build/lint/test.

## Reporting issues

Open a GitHub issue describing the problem or proposal. Include repro steps for bugs.
