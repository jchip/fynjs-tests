import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import path from "node:path";
import { asyncVerify } from "run-verify";
import unwrap, { unwrapNpmCmd, quote, unquote, relative, resolveNpmCmd } from "unwrap-npm-cmd";

const require = createRequire(import.meta.url);
const isWin = process.platform === "win32";

describe("unwrap-npm-cmd", () => {
  it("ESM exports default and named functions", () => {
    expect(typeof unwrap).toBe("function");
    expect(unwrapNpmCmd).toBe(unwrap);
    for (const f of [quote, unquote, relative, resolveNpmCmd]) expect(typeof f).toBe("function");
  });

  it("CJS require returns callable with named exports attached", () => {
    const cjs = require("unwrap-npm-cmd");
    expect(typeof cjs).toBe("function");
    expect(typeof cjs.quote).toBe("function");
    expect(cjs("echo hi")).toBe(unwrap("echo hi"));
  });

  it("quote and unquote", () => {
    expect(quote("a b")).toBe('"a b"');
    expect(quote('"a b"')).toBe('"a b"');
    expect(unquote(' "a b" ')).toBe("a b");
  });

  it("relative gives a ./ or ../ prefixed path", () => {
    const cwd = path.resolve("/tmp/x");
    expect(relative(path.join(cwd, "a", "b.js"), cwd)).toBe(`.${path.sep}${path.join("a", "b.js")}`);
    expect(relative(path.resolve("/tmp/y/z.js"), cwd).startsWith("..")).toBe(true);
  });

  it("unwrapNpmCmd leaves commands intact on non-windows", () => {
    if (isWin) return;
    expect(unwrap("npm test")).toBe("npm test");
    expect(unwrap("mocha test", { jsOnly: true })).toBe("mocha test");
  });

  it("unwrapNpmCmd keeps args and never throws for unknown exe", async () => {
    await asyncVerify(
      () => unwrap("definitely-not-a-real-cmd-xyz --flag"),
      (r) => expect(r).toContain("--flag")
    );
  });

  it("resolveNpmCmd finds a real exe or throws for a missing one", () => {
    if (isWin) return;
    const r = resolveNpmCmd("sh");
    expect(typeof r).toBe("string");
    expect(r).toContain("sh");
    expect(() => resolveNpmCmd("definitely-not-a-real-cmd-xyz")).toThrow();
  });
});
