import { describe, expect, it } from "vitest";

import { createDb, evidence, ideas, newId, runs, scores, signals } from "../src/index.js";

describe("core: schema + provenance", () => {
  it("round-trips an idea through an in-memory database", () => {
    const db = createDb(":memory:");

    db.insert(ideas)
      .values({ id: newId(), statement: "Test idea", coreKeywords: JSON.stringify(["test"]) })
      .run();
    const rows = db.select().from(ideas).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.statement).toBe("Test idea");
  });

  it("links a signal back to the evidence rows it was computed from", () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "Test idea" }).run();

    const evidenceId = newId();
    db.insert(evidence)
      .values({
        id: evidenceId,
        ideaId,
        source: "reddit",
        kind: "reddit_post",
        url: "https://reddit.com/r/test/comments/abc",
        rawJson: JSON.stringify({ title: "test post" }),
      })
      .run();

    db.insert(signals)
      .values({
        id: newId(),
        ideaId,
        themeTag: "test_theme",
        themeLabel: "Test theme",
        postCount: 3,
        distinctAuthorCount: 3,
        distinctSubredditCount: 1,
        supportingEvidenceIds: JSON.stringify([evidenceId]),
        totalUpvotes: 10,
        totalComments: 5,
        workaroundMentionCount: 0,
        oldestCreatedUtc: 1,
        mostRecentCreatedUtc: 2,
        clusterScore: 1.5,
        countedInScore: true,
      })
      .run();

    const [signal] = db.select().from(signals).all();
    expect(signal).toBeDefined();
    const provenance = JSON.parse(signal!.supportingEvidenceIds) as string[];
    expect(provenance).toEqual([evidenceId]);
  });

  it("stores not_collected scores with a null value, never a fabricated zero", () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "Test idea" }).run();
    const runId = newId();
    db.insert(runs).values({ id: runId, ideaId, provider: "claude-code", status: "completed" }).run();
    db.insert(scores)
      .values({
        id: newId(),
        ideaId,
        runId,
        scoreType: "demand",
        value: null,
        confidence: null,
        notCollected: true,
        inputsJson: "{}",
      })
      .run();

    const [row] = db.select().from(scores).all();
    expect(row?.value).toBeNull();
    expect(row?.notCollected).toBe(true);
  });
});
