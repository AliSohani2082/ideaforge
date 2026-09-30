import { describe, expect, it } from "vitest";

import { COLLECTOR_SOURCES } from "../src/index.js";

describe("collectors: source registry placeholder", () => {
  it("declares the four evidence sources IdeaForge collects from", () => {
    expect(COLLECTOR_SOURCES).toEqual(["reddit", "github", "producthunt", "hackernews"]);
  });
});
