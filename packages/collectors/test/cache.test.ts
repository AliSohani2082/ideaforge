import { createDb, ideas, newId } from "@ideaforge/core";
import { describe, expect, it } from "vitest";

import { fetchAndCache } from "../src/cache.js";

describe("collectors: evidence cache", () => {
  it("calls fetchFn once and caches into the evidence table", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "test idea" }).run();

    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      return { hello: "world" };
    };

    const first = await fetchAndCache({ db, ideaId, source: "github", kind: "github_repo_search", url: "https://api.github.com/x", fetchFn });
    expect(first.cached).toBe(false);
    expect(calls).toBe(1);

    const second = await fetchAndCache({ db, ideaId, source: "github", kind: "github_repo_search", url: "https://api.github.com/x", fetchFn });
    expect(second.cached).toBe(true);
    expect(second.data).toEqual({ hello: "world" });
    expect(calls).toBe(1); // no second network call
  });

  it("keys distinct URLs to distinct evidence rows even with identical bodies", async () => {
    const db = createDb(":memory:");
    const ideaId = newId();
    db.insert(ideas).values({ id: ideaId, statement: "test idea" }).run();

    const fetchFn = async () => ({ same: true });
    const a = await fetchAndCache({ db, ideaId, source: "reddit", kind: "reddit_search", url: "https://reddit.com/a", fetchFn });
    const b = await fetchAndCache({ db, ideaId, source: "reddit", kind: "reddit_search", url: "https://reddit.com/b", fetchFn });
    expect(a.evidenceId).not.toBe(b.evidenceId);
  });
});
