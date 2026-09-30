import { describe, expect, it } from "vitest";

import { createIdeaForgeMcpServer, MCP_SERVER_NAME } from "../src/index.js";

describe("mcp: placeholder server", () => {
  it("names the server", () => {
    expect(MCP_SERVER_NAME).toBe("ideaforge");
  });

  it("is not implemented yet", () => {
    expect(() => createIdeaForgeMcpServer()).toThrow(/not implemented/);
  });
});
