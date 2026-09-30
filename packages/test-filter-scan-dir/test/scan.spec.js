import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asyncVerify, expectError } from "run-verify";
import { filterScanDir, filterScanDirSync } from "filter-scan-dir";

let root;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "fsd-"));
  const files = {
    "a.js": "a",
    "b.ts": "bb",
    "c.md": "ccc",
    "src/d.js": "d",
    "src/e.ts": "e",
    "src/deep/f.js": "f",
    "node_modules/pkg/g.js": "g",
    ".gitignore": "ignored.js\nbuild/\n",
    "ignored.js": "x",
    "build/out.js": "x"
  };
  for (const [f, c] of Object.entries(files)) {
    const full = path.join(root, f);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, c);
  }
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const sorted = arr => [...arr].sort();

describe("filter-scan-dir", () => {
  it("CJS require returns the function with named exports", () => {
    const require = createRequire(import.meta.url);
    const cjs = require("filter-scan-dir");
    expect(typeof cjs).toBe("function");
    expect(typeof cjs.filterScanDirSync).toBe("function");
  });

  it("sync and async scan return the same recursive file list", async () => {
    const opts = { cwd: root, ignoreDirs: ["node_modules"], sortFiles: true };
    const s = filterScanDirSync(opts);
    const a = await filterScanDir(opts);
    expect(sorted(s)).toEqual(
      sorted(["a.js", "b.ts", "c.md", ".gitignore", "ignored.js", "src/d.js", "src/e.ts", "src/deep/f.js", "build/out.js"])
    );
    expect(sorted(a)).toEqual(sorted(s));
  });

  it("filterExt, ignoreExt and maxLevel", () => {
    const base = { cwd: root, ignoreDirs: ["node_modules", "build"] };
    expect(sorted(filterScanDirSync({ ...base, filterExt: [".ts"] }))).toEqual(["b.ts", "src/e.ts"]);
    expect(filterScanDirSync({ ...base, ignoreExt: [".js", ".ts", ".md"] })).toEqual([".gitignore"]);
    expect(sorted(filterScanDirSync({ ...base, filterExt: ".js", maxLevel: 0 }))).toEqual(["a.js", "ignored.js"]);
  });

  it("filter and filterDir callbacks", async () => {
    const r = await filterScanDir({
      cwd: root,
      filter: (file, dir) => file.endsWith(".js") && dir !== "build",
      filterDir: dir => dir !== "node_modules" && dir !== "build"
    });
    expect(sorted(r)).toEqual(["a.js", "ignored.js", "src/d.js", "src/deep/f.js"]);
  });

  it("prependCwd, prefix and includeDir", () => {
    const withCwd = filterScanDirSync({ cwd: root, filterExt: ".md", prependCwd: true });
    expect(withCwd).toEqual([`${root.split(path.sep).join("/")}/c.md`]);
    const dirs = filterScanDirSync({ cwd: root, includeDir: true, ignoreDirs: ["node_modules", "build"], maxLevel: 0 });
    expect(dirs).toEqual(expect.arrayContaining(["src", "a.js"]));
  });

  it("grouping returns files by group name", () => {
    const g = filterScanDirSync({
      cwd: root,
      grouping: true,
      ignoreDirs: ["node_modules", "build"],
      filter: (_f, _d, { ext }) => (ext === ".js" ? "js" : ext === ".ts" ? "ts" : false)
    });
    expect(sorted(g.js)).toEqual(["a.js", "ignored.js", "src/d.js", "src/deep/f.js"]);
    expect(sorted(g.ts)).toEqual(["b.ts", "src/e.ts"]);
  });

  it("stop halts the scan", () => {
    const stopped = filterScanDirSync({ cwd: root, ignoreDirs: ["node_modules"], filter: () => ({ stop: true }) });
    expect(stopped.length).toBeLessThanOrEqual(1);
  });

  it("gitignore parser prunes ignored files and dirs, sync and async", async () => {
    // minimal stand-in for the `ignore` package: exact names and dir/ patterns
    const parser = contents => {
      const rules = contents.split("\n").filter(Boolean);
      return {
        test: p => {
          const ignored = rules.some(r => (r.endsWith("/") ? p === r.slice(0, -1) || p.startsWith(r) : p === r));
          return { ignored, unignored: false };
        }
      };
    };
    const opts = { cwd: root, ignoreDirs: ["node_modules"], gitignore: parser };
    const s = filterScanDirSync(opts);
    expect(s).toContain("a.js");
    expect(s).not.toContain("ignored.js");
    expect(s).not.toContain("build/out.js");
    expect(sorted(await filterScanDir(opts))).toEqual(sorted(s));
  });

  it("prefilter with fullStat false throws; rethrowError surfaces missing dir", async () => {
    await asyncVerify(
      expectError(() => filterScanDirSync({ cwd: root, fullStat: false, prefilter: () => true })),
      err => expect(err).toBeInstanceOf(Error),
      expectError(() => filterScanDir({ cwd: path.join(root, "nope"), rethrowError: true })),
      err => expect(err.code).toBe("ENOENT")
    );
    expect(await filterScanDir({ cwd: path.join(root, "nope") })).toEqual([]);
  });
}, 30000);
