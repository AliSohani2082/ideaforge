import { join } from "node:path";

import { createDefaultDeps } from "./deps.js";
import type { CliDeps } from "./deps.js";
import { findOrCreateIdea, runEval } from "./orchestrate.js";
import { loadReportData } from "./report-loader.js";
import { renderReport } from "./report.js";

export const HELP_TEXT = `ideaforge - evidence-based idea evaluation

Usage:
  ideaforge init                    Create/open the local ideaforge.db
  ideaforge idea add "<idea>"       Register an idea without evaluating it
  ideaforge eval "<idea>"           Collect evidence, score, and write a markdown report
  ideaforge report <idea-id>        Re-render the report for a previously evaluated idea
  ideaforge db path                 Print the resolved ideaforge.db path

Options:
  -v, --version   Print the version number
  -h, --help      Print this help message

IdeaForge gathers evidence about a business idea (Reddit demand signals,
competitors, similar products on GitHub), scores it with deterministic
formulas, and stores everything in a local SQLite database.
`;

export interface CliResult {
  readonly output: string;
  readonly exitCode: number;
}

function scoreTable(result: Awaited<ReturnType<typeof runEval>>): string {
  const rows = result.scoresSummary.map((s) => {
    const value = s.notCollected ? "not collected" : (s.value?.toFixed(1) ?? "—");
    const confidence = s.confidence ?? "n/a";
    return `  ${s.scoreType.padEnd(12)} ${value.padEnd(14)} ${confidence}`;
  });
  return [`Verdict: ${result.verdict} (overall confidence: ${result.overallConfidence ?? "n/a"})`, "", "  score        value          confidence", ...rows].join("\n");
}

async function cmdInit(deps: CliDeps): Promise<CliResult> {
  const path = deps.resolveDbPath();
  deps.openDb(path);
  return { output: `Initialized IdeaForge database at ${path}`, exitCode: 0 };
}

async function cmdIdeaAdd(args: readonly string[], deps: CliDeps): Promise<CliResult> {
  const statement = args.join(" ").trim();
  if (!statement) return { output: 'Usage: ideaforge idea add "<idea statement>"', exitCode: 1 };
  const db = deps.openDb();
  const { id } = findOrCreateIdea(db, statement);
  return { output: `Idea ${id}\n${statement}`, exitCode: 0 };
}

async function cmdEval(args: readonly string[], deps: CliDeps): Promise<CliResult> {
  const statement = args.join(" ").trim();
  if (!statement) return { output: 'Usage: ideaforge eval "<idea statement>"', exitCode: 1 };

  const db = deps.openDb();
  const provider = deps.createProvider();
  const result = await runEval(statement, {
    db,
    provider,
    githubToken: process.env.GITHUB_TOKEN,
    redditUserAgent: process.env.IDEAFORGE_REDDIT_USER_AGENT,
  });

  const reportDir = join(deps.cwd(), "ideaforge-reports");
  deps.mkdirSync(reportDir);
  const reportPath = join(reportDir, `${result.ideaId}.md`);
  deps.writeFile(reportPath, renderReport(result));

  return { output: `${scoreTable(result)}\n\nReport written to ${reportPath}`, exitCode: 0 };
}

async function cmdReport(args: readonly string[], deps: CliDeps): Promise<CliResult> {
  const ideaId = args[0];
  if (!ideaId) return { output: "Usage: ideaforge report <idea-id>", exitCode: 1 };
  const db = deps.openDb();
  const result = loadReportData(db, ideaId);
  if (!result) return { output: `No idea found with id ${ideaId}`, exitCode: 1 };
  return { output: renderReport(result), exitCode: 0 };
}

async function cmdDb(args: readonly string[], deps: CliDeps): Promise<CliResult> {
  if (args[0] === "path") return { output: deps.resolveDbPath(), exitCode: 0 };
  return { output: "Usage: ideaforge db path", exitCode: 1 };
}

export async function runCli(argv: readonly string[], version: string, deps: CliDeps = createDefaultDeps()): Promise<CliResult> {
  const [command, ...rest] = argv;

  if (!command) return { output: HELP_TEXT, exitCode: 0 };
  if (command === "-v" || command === "--version") return { output: version, exitCode: 0 };
  if (command === "-h" || command === "--help") return { output: HELP_TEXT, exitCode: 0 };

  switch (command) {
    case "init":
      return cmdInit(deps);
    case "idea":
      if (rest[0] === "add") return cmdIdeaAdd(rest.slice(1), deps);
      return { output: 'Usage: ideaforge idea add "<idea>"', exitCode: 1 };
    case "eval":
      return cmdEval(rest, deps);
    case "report":
      return cmdReport(rest, deps);
    case "db":
      return cmdDb(rest, deps);
    default:
      return { output: `Unknown command: ${command}\n\n${HELP_TEXT}`, exitCode: 1 };
  }
}
