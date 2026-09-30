import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import Path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createTsMapper, createResolveHook, createResolveFilename, install, defaultIsFile } from "@fynjs/ts-resolve";

const require = createRequire(import.meta.url);
const u = p => pathToFileURL(p).href;

// fake filesystem: only the listed files exist
const fakeFs = files => {
  const set = new Set(files.map(u));
  return { isFile: url => set.has(url) };
};

describe("@fynjs/ts-resolve", { timeout: 60000 }, () => {
  it("exports the public API", () => {
    expect(typeof install).toBe("function");
    expect(typeof createTsMapper).toBe("function");
    expect(typeof createResolveHook).toBe("function");
    expect(typeof createResolveFilename).toBe("function");
    expect(typeof defaultIsFile).toBe("function");
  });

  it("maps .js to .ts when only the .ts exists", () => {
    const map = createTsMapper(fakeFs(["/p/foo.ts"]));
    expect(map(u("/p/foo.js"))).toBe(u("/p/foo.ts"));
  });

  it("maps .mjs to .mts and .cjs to .cts", () => {
    const map = createTsMapper(fakeFs(["/p/a.mts", "/p/b.cts"]));
    expect(map(u("/p/a.mjs"))).toBe(u("/p/a.mts"));
    expect(map(u("/p/b.cjs"))).toBe(u("/p/b.cts"));
  });

  it("never shadows a real .js file", () => {
    const map = createTsMapper(fakeFs(["/p/foo.js", "/p/foo.ts"]));
    expect(map(u("/p/foo.js"))).toBeNull();
  });

  it("maps extensionless specifiers and directory index", () => {
    const map = createTsMapper(fakeFs(["/p/foo.ts", "/p/dir/index.ts"]));
    expect(map(u("/p/foo"))).toBe(u("/p/foo.ts"));
    expect(map(u("/p/dir"))).toBe(u("/p/dir/index.ts"));
  });

  it("leaves node_modules alone", () => {
    const map = createTsMapper(fakeFs(["/p/node_modules/x/foo.ts"]));
    expect(map(u("/p/node_modules/x/foo.js"))).toBeNull();
  });

  it("resolve hook returns the mapped url", () => {
    const hook = createResolveHook({ isFile: fakeFs(["/p/foo.ts"]).isFile });
    const next = spec => ({ url: new URL(spec, u("/p/main.ts")).href });
    const res = hook("./foo.js", { parentURL: u("/p/main.ts") }, next);
    expect(res.url).toBe(u("/p/foo.ts"));
  });

  it("runs ESM ts with .js specifiers via --import register", () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "tsres-"));
    try {
      fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify({ type: "module" }));
      fs.writeFileSync(Path.join(dir, "lib.ts"), `export const hi = (n: string): string => "hi " + n;\n`);
      fs.writeFileSync(Path.join(dir, "noext.ts"), `export const v: number = 42;\n`);
      fs.writeFileSync(
        Path.join(dir, "main.ts"),
        `import { hi } from "./lib.js";\nimport { v } from "./noext";\nconsole.log(hi("x"), v);\n`
      );
      const regUrl = u(require.resolve("@fynjs/ts-resolve/register"));
      const r = spawnSync(process.execPath, ["--import", regUrl, "main.ts"], { cwd: dir, encoding: "utf8" });
      expect(r.stderr).not.toMatch(/ERR_MODULE_NOT_FOUND/);
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("hi x 42");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
