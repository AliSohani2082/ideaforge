import { describe, expect, it } from "vitest";

import { COLLECTOR_SOURCES } from "../src/index.js";

describe("collectors: source registry", () => {
  it("declares the two evidence sources IdeaForge v0 collects from", () => {
    expect(COLLECTOR_SOURCES).toEqual(["reddit", "github"]);
  });
});
