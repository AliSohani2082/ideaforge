import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

describe("cli: --version / --help", () => {
  it("prints the version for -v / --version", async () => {
    expect((await runCli(["--version"], "1.2.3")).output).toBe("1.2.3");
    expect((await runCli(["-v"], "1.2.3")).output).toBe("1.2.3");
  });

  it("prints usage for --help", async () => {
    expect((await runCli(["--help"], "1.2.3")).output).toMatch(/Usage:/);
  });

  it("prints usage when called with no arguments", async () => {
    expect((await runCli([], "1.2.3")).output).toMatch(/Usage:/);
  });

  it("reports an unknown command with a non-zero exit code", async () => {
    const result = await runCli(["frobnicate"], "1.2.3");
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/Unknown command/);
  });
});
