/**
 * Placeholder for the MCP server exposing IdeaForge's domain model to MCP clients. Wiring to
 * @ideaforge/core and the real tool surface lands in a follow-up task.
 */
export const MCP_SERVER_NAME = "ideaforge";

export function createIdeaForgeMcpServer(): never {
  throw new Error("IdeaForge MCP server is not implemented yet — placeholder for a future task");
}
