import { describe, expect, it } from "vitest";

import { APP_NAME } from "../lib/constants";

describe("dashboard: constants", () => {
  it("names the app", () => {
    expect(APP_NAME).toBe("IdeaForge Dashboard");
  });
});
