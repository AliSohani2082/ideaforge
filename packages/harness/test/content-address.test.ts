import { describe, expect, it } from "vitest";

import { contentAddress } from "../src/index.js";

describe("harness: content addressing", () => {
  it("is deterministic for the same input", () => {
    const input = { ideaId: "abc", step: "extract-pain-points", version: 1 };
    expect(contentAddress(input)).toBe(contentAddress({ ...input }));
  });

  it("changes when the input changes, invalidating exactly that step", () => {
    const a = contentAddress({ ideaId: "abc", step: "extract-pain-points", version: 1 });
    const b = contentAddress({ ideaId: "abc", step: "extract-pain-points", version: 2 });
    expect(a).not.toBe(b);
  });
});
