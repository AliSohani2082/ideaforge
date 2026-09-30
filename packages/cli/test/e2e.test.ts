import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const distEntry = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// End-to-end smoke test: runs the built binary the way a fresh-clone user would
// (`pnpm install && pnpm build`, then `node dist/index.js`). Requires `pnpm build`
// to have run first, which CI always does before `pnpm test`.
describe.skipIf(!existsSync(distEntry))("cli: end-to-end binary smoke test", () => {
  it("prints the version for --version", () => {
    const output = execFileSync("node", [distEntry, "--version"], { encoding: "utf-8" });
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("prints usage for --help", () => {
    const output = execFileSync("node", [distEntry, "--help"], { encoding: "utf-8" });
    expect(output).toMatch(/Usage:/);
  });
});
