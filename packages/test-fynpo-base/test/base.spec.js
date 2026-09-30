import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import Path from "node:path";
import { verify } from "run-verify";
import {
  posixify,
  writeJson,
  readJson,
  writeJsonSync,
  readJsonSync,
  readPkgJson,
  makeGitignoreMatcher,
  FynpoConfigError,
  isFynpoConfigError,
  formatFynpoConfigError,
  resolvePackagesConfig,
  packageScope,
  outOfScopePackages,
  PackageRef,
  FynpoDepGraph,
  FynpoConfigManager,
  pkgId,
  getDepSection,
  caching
} from "@fynpo/base";

let root;

const writePkg = (rel, json) => {
  const dir = Path.join(root, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(Path.join(dir, "package.json"), JSON.stringify(json, null, 2));
};

beforeAll(() => {
  root = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-base-"));
  fs.writeFileSync(Path.join(root, "fynpo.json"), JSON.stringify({ command: { bootstrap: {} } }));
  fs.writeFileSync(Path.join(root, ".gitignore"), "ignored-dir/\n*.log\n");
  writePkg("packages/a", { name: "pkg-a", version: "1.0.0", dependencies: { "pkg-b": "^1.0.0" } });
  writePkg("packages/b", { name: "pkg-b", version: "1.2.0", dependencies: { "pkg-c": "^1.0.0" } });
  writePkg("packages/c", { name: "pkg-c", version: "1.0.5", devDependencies: { "pkg-a": "^1.0.0" } });
  writePkg("packages/d", { name: "pkg-d", version: "0.1.0", dependencies: { "pkg-b": "^1.0.0" } });
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe("@fynpo/base", { timeout: 20000 }, () => {
  it("exports the public API", () => {
    for (const f of [posixify, readJson, FynpoDepGraph, FynpoConfigManager, resolvePackagesConfig]) {
      expect(typeof f).toBe("function");
    }
    expect(caching).toBeDefined();
  });

  it("json helpers round trip with pretty output", async () => {
    const f = Path.join(root, "x.json");
    await writeJson(f, { a: 1 });
    expect(fs.readFileSync(f, "utf8")).toBe('{\n  "a": 1\n}\n');
    expect(await readJson(f)).toEqual({ a: 1 });
    writeJsonSync(f, { b: 2 });
    expect(readJsonSync(f)).toEqual({ b: 2 });
    expect((await readPkgJson(Path.join(root, "packages/a"))).name).toBe("pkg-a");
  });

  it("posixify keeps posix paths intact", () => {
    expect(posixify("a/b/c")).toBe("a/b/c");
  });

  it("gitignore matcher honors rules and tolerates none", () => {
    const m = makeGitignoreMatcher(root);
    expect(m.hasRules).toBe(true);
    expect(m.ignores("foo.log")).toBe(true);
    expect(m.ignores("src/foo.js")).toBe(false);
    const empty = makeGitignoreMatcher(Path.join(root, "packages"));
    expect(empty.hasRules).toBe(false);
    expect(empty.ignores("anything")).toBe(false);
  });

  it("config error helpers", () => {
    const err = new FynpoConfigError("/x/fynpo.json", "bad json");
    expect(err.code).toBe("FYNPO_BAD_CONFIG");
    expect(isFynpoConfigError(err)).toBe(true);
    expect(isFynpoConfigError(new Error("x"))).toBe(false);
    const banner = formatFynpoConfigError(err, "fynpo");
    expect(banner).toContain("fynpo.json");
    expect(banner).toContain("bad json");
  });

  it("resolvePackagesConfig applies defaults for both shapes", () => {
    const d = resolvePackagesConfig();
    expect(d.autoSearch.enable).toBe(true);
    expect(d.autoSearch.respectGitignore).toBe(false);
    const arr = resolvePackagesConfig(["packages/*"]);
    expect(arr.include).toEqual(["packages/*"]);
    expect(arr.publishInclude.length).toBe(1);
    expect(arr.publishInclude[0]).toContain("packages/*");
    const off = resolvePackagesConfig({ autoSearch: { enable: false } });
    expect(off.include).toEqual(["packages/*"]);
  });

  it("scope helpers", () => {
    expect(packageScope("@fynjs/run")).toBe("@fynjs");
    expect(packageScope("fynpo")).toBeUndefined();
    const out = outOfScopePackages(["fynjs"], ["@fynjs/run", "@other/x", "plain"]);
    expect(out.sort()).toEqual(["@other/x", "plain"]);
    expect(outOfScopePackages(undefined, ["a"])).toEqual([]);
  });

  it("PackageRef matches by name, id and path", () => {
    const info = { name: "pkg-a", version: "1.0.0", path: "packages/a" };
    expect(new PackageRef("pkg-a").match(info)).toBe(true);
    expect(new PackageRef("pkg-a@1.0.0").match(info)).toBe(true);
    expect(new PackageRef("path:packages/*").match(info)).toBe(true);
    expect(new PackageRef("/^pkg-/").match(info)).toBe(true);
    expect(new PackageRef("pkg-z").match(info)).toBe(false);
    expect(pkgId("a", "1.0.0")).toBe("a@1.0.0");
    expect(getDepSection("devDependencies")).toBe("dev");
  });

  it("FynpoConfigManager loads fynpo.json and finds top dir", async () => {
    const mgr = new FynpoConfigManager({ cwd: Path.join(root, "packages/a") });
    const cfg = await mgr.load();
    expect(cfg.command.bootstrap).toBeDefined();
    expect(fs.realpathSync(mgr.topDir)).toBe(fs.realpathSync(root));
    expect(mgr.fileName).toBe("fynpo.json");
  });

  it("FynpoConfigManager surfaces a broken config as FynpoConfigError", async () => {
    const bad = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-bad-"));
    try {
      fs.writeFileSync(Path.join(bad, "fynpo.json"), "{ nope,, }");
      await verify({ timeout: 5000 })
        .expectError
        .step(() => new FynpoConfigManager({ cwd: bad }).load())
        .step(err => expect(isFynpoConfigError(err)).toBe(true));
    } finally {
      fs.rmSync(bad, { recursive: true, force: true });
    }
  });

  it("FynpoDepGraph discovers packages and resolves local deps", async () => {
    const g = new FynpoDepGraph({ cwd: root });
    await g.resolve();
    expect(Object.keys(g.packages.byName).sort()).toEqual(["pkg-a", "pkg-b", "pkg-c", "pkg-d"]);
    expect(g.packages.byId["pkg-b@1.2.0"].path).toBe("packages/b");
    const a = g.depMapByPath["packages/a"];
    expect(Object.keys(a.localDepsByPath)).toEqual(["packages/b"]);
    const b = g.depMapByPath["packages/b"];
    expect(Object.keys(b.dependentsByPath).sort()).toEqual(["packages/a", "packages/d"]);
  });

  it("FynpoDepGraph topo sort orders deps first and flags circulars", async () => {
    const g = new FynpoDepGraph({ cwd: root });
    await g.resolve();
    const topo = g.getTopoSortPackages();
    // a -> b -> c -> a (dev) is a cycle; d depends on b
    const circ = topo.circulars.map(x => x.pkgInfo.name).sort();
    expect(circ).toEqual(expect.arrayContaining(["pkg-a", "pkg-b", "pkg-c"]));
    expect(topo.sorted.length).toBe(4);
  });

  it("FynpoDepGraph resolves a name and semver to a local package", async () => {
    const g = new FynpoDepGraph({ cwd: root });
    await g.resolve();
    const r = g.resolvePackage("pkg-b", "^1.0.0");
    expect(r?.path).toBe("packages/b");
    expect(g.resolvePackage("pkg-b", "^9.0.0", false)).toBeUndefined();
    expect(g.resolvePackage("pkg-b", "^9.0.0").path).toBe("packages/b");
    expect(g.resolvePackage("nope", "^1.0.0")).toBeUndefined();
  });
});
