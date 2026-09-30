import type { RunEvalResult } from "./orchestrate.js";

const SCORE_LABELS: Record<string, string> = {
  demand: "Demand",
  competition: "Competition",
  complexity: "Complexity",
  margin: "Margin",
  readiness: "Readiness",
};

function fmtScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}

function fmtTier(tier: string | null): string {
  return tier ?? "n/a";
}

export function renderReport(result: RunEvalResult): string {
  const lines: string[] = [];
  lines.push(`# IdeaForge report: ${result.statement}`);
  lines.push("");
  lines.push(`**Verdict: ${result.verdict}** (overall confidence: ${fmtTier(result.overallConfidence)})`);
  lines.push("");

  if (result.redditCollectionFailed && result.demandNotCollectedReason) {
    lines.push(`> ⚠️ ${result.demandNotCollectedReason}`);
    lines.push("");
  }
  if (result.githubRateLimitMessage) {
    lines.push(`> ⚠️ ${result.githubRateLimitMessage}`);
    lines.push("");
  }

  lines.push("## Scores");
  lines.push("");
  lines.push("| Score | Value | Confidence |");
  lines.push("| --- | --- | --- |");
  for (const s of result.scoresSummary) {
    lines.push(`| ${SCORE_LABELS[s.scoreType] ?? s.scoreType} | ${s.notCollected ? "not collected" : fmtScore(s.value)} | ${fmtTier(s.confidence)} |`);
  }
  lines.push("");

  lines.push("## Demand themes (Reddit)");
  lines.push("");
  lines.push(`Core keywords: ${result.coreKeywords.join(", ") || "(none)"}`);
  lines.push("");
  lines.push(`Subreddits searched: ${result.subredditsSearched.join(", ") || "(none — see warning above)"}`);
  lines.push("");
  if (result.demandThemes.length === 0) {
    lines.push("No pain-point themes were found in the collected evidence.");
  } else {
    for (const theme of result.demandThemes) {
      lines.push(
        `### ${theme.themeLabel} ${theme.countedInScore ? "" : "_(below the noise floor — not counted in the score)_"}`,
      );
      lines.push("");
      lines.push(
        `${theme.postCount} post(s), ${theme.distinctAuthorCount} distinct author(s), cluster score ${theme.clusterScore.toFixed(2)}, subreddits: ${theme.subreddits.join(", ")}`,
      );
      lines.push("");
      for (const post of theme.posts) {
        lines.push(`- [${post.title}](${post.url}) — u/${post.author}`);
      }
      lines.push("");
    }
  }

  lines.push("## Competitors");
  lines.push("");
  if (result.competitorsSummary.length === 0) {
    lines.push("No competitors were found in the collected evidence.");
  } else {
    lines.push("| Name | Type | Stars | Last release (days ago) |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of result.competitorsSummary) {
      lines.push(`| [${c.name}](${c.url}) | ${c.competitorType} | ${c.githubStars ?? "—"} | ${c.lastReleaseAgeDays ?? "—"} |`);
    }
  }
  lines.push("");

  lines.push("## Feature matrix");
  lines.push("");
  if (result.featureMatrix.length === 0) {
    lines.push("No feature matrix was extracted (no competitors found).");
  } else {
    lines.push("| Competitor | Feature | Present | Quality | Evidence |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const row of result.featureMatrix) {
      lines.push(
        `| ${row.competitor} | ${row.featureTag} | ${row.present ? "yes" : "no"} | ${row.qualityFlag} | ${row.evidenceQuote || "—"} |`,
      );
    }
  }
  lines.push("");

  lines.push("## Competitive edge");
  lines.push("");
  if (result.competitiveEdge) {
    lines.push(
      `The most promising wedge is **${result.competitiveEdge.feature}** — attempted by ${result.competitiveEdge.coverageCount} competitor(s) but with an edge score of ${result.competitiveEdge.edgeScore.toFixed(2)} (≥ 0.5 threshold, so this is a validated gap, not a hallucinated one).`,
    );
  } else {
    lines.push("No feature cleared the competitive-edge threshold with validated competitor coverage.");
  }
  if (result.unaddressedFeatures.length > 0) {
    lines.push("");
    lines.push("Unaddressed, demand-backed features (no competitor has attempted these at all):");
    for (const f of result.unaddressedFeatures) {
      lines.push(`- ${f.feature}`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push(
    `_Margin's cost-to-serve figures are a stated assumption table, not measured data — see the CLI output for the disclosure. CAC is not estimated; no fetchable input source exists for it._`,
  );
  lines.push("");

  return lines.join("\n");
}
