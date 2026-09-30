import { describe, expect, it } from "vitest";

import { createDb, ideas } from "../src/index.js";

describe("core: Drizzle + better-sqlite3 wiring", () => {
  it("round-trips a row through an in-memory database", () => {
    const db = createDb(":memory:");

    db.insert(ideas).values({ name: "Test idea" }).run();
    const rows = db.select().from(ideas).all();

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Test idea");
    expect(rows[0]?.id).toBe(1);
  });
});
