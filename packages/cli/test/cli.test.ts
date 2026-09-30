import { describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

describe("cli: --version / --help", () => {
  it("prints the version for -v / --version", () => {
    expect(runCli(["--version"], "1.2.3").output).toBe("1.2.3");
    expect(runCli(["-v"], "1.2.3").output).toBe("1.2.3");
  });

  it("prints usage for --help", () => {
    expect(runCli(["--help"], "1.2.3").output).toMatch(/Usage:/);
  });

  it("prints usage when called with no arguments", () => {
    expect(runCli([], "1.2.3").output).toMatch(/Usage:/);
  });
});
