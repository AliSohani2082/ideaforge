export const HELP_TEXT = `ideaforge - evidence-based idea evaluation

Usage:
  ideaforge [options]

Options:
  -v, --version   Print the version number
  -h, --help      Print this help message

IdeaForge gathers evidence about a business idea (Reddit demand signals,
competitors, similar products on GitHub/Product Hunt), scores it with
deterministic formulas, and stores everything in a local SQLite database.
`;

export interface CliResult {
  readonly output: string;
  readonly exitCode: number;
}

export function runCli(argv: readonly string[], version: string): CliResult {
  const arg = argv[0];

  if (arg === "-v" || arg === "--version") {
    return { output: version, exitCode: 0 };
  }

  return { output: HELP_TEXT, exitCode: 0 };
}
