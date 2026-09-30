import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verify } from "run-verify";
import { prePackObj, keepStandardFields, extractFromObj, removeFromObj, renameFromObj } from "publish-util";
import * as pu from "publish-util";

const bin = name => path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", ".bin", name);

const mkPkg = (name, extra = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-util-"));
  const pkg = {
    name,
    version: "1.0.0",
    scripts: { test: "t", build: "b" },
    devDependencies: { foo: "^1.0.0" },
    nyc: { reporter: ["text"] },
    options: {},
    publishUtil: { remove: ["devDependencies", { scripts: ["test", "build"] }], keep: ["options"] },
    ...extra
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
  return { dir, pkg };
};

const run = (name, dir, args = []) =>
  execFileSync(bin(name), args, {
    cwd: dir,
    env: { ...process.env, PUBLISH_UTIL_PKG_DIR: dir, npm_package_name: "", INIT_CWD: dir },
    encoding: "utf8",
    timeout: 30000
  });

const readPkg = dir => JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));

describe("publish-util", () => {
  it("exports the public API", () => {
    for (const k of ["prePackObj", "prePack", "postPack", "npmPublish", "getInfo", "getPackInfo", "utils"]) {
      expect(pu[k]).toBeDefined();
    }
    expect(keepStandardFields).toContain("name");
  });

  it("prePackObj removes configured and non-standard fields", () => {
    const pkg = {
      name: "x",
      version: "1.0.0",
      scripts: { test: "t", build: "b", start: "s" },
      devDependencies: { a: "1" },
      nyc: {},
      publishUtil: {}
    };
    prePackObj(pkg, {
      remove: ["devDependencies", { scripts: ["test", "build"] }],
      silent: true
    });
    expect(pkg.devDependencies).toBeUndefined();
    expect(pkg.nyc).toBeUndefined();
    expect(pkg.publishUtil).toBeUndefined();
    expect(pkg.scripts.test).toBeUndefined();
    expect(pkg.scripts.start).toBe("s");
    expect(pkg.scripts.postpack).toBe("publish-util-postpack");
  });

  it("prePackObj keep restores fields and rename moves them", () => {
    const pkg = { name: "x", version: "1", custom: { a: 1 }, old: 5 };
    prePackObj(pkg, { keep: ["custom"], rename: { old: "renamed" }, silent: true, autoPostPack: false });
    expect(pkg.custom).toEqual({ a: 1 });
    expect(pkg.old).toBeUndefined();
  });

  it("object helpers extract, remove and rename", () => {
    const o = { a: 1, b: { c: 2, d: 3 } };
    expect(extractFromObj(o, [{ b: ["c"] }])).toEqual({ b: { c: 2 } });
    removeFromObj(o, ["a", { b: ["d"] }]);
    expect(o).toEqual({ b: { c: 2 } });
    renameFromObj(o, { "b.c": "z" });
    expect(o.z).toBe(2);
  });

  it("bins are installed", () => {
    for (const b of ["publish-util-prepack", "publish-util-postpack", "do-publish"]) {
      expect(fs.existsSync(bin(b))).toBe(true);
    }
  });

  it("prepack then postpack round trips package.json", async () => {
    const { dir, pkg } = mkPkg(`pu-roundtrip-${process.pid}`);
    const original = fs.readFileSync(path.join(dir, "package.json"), "utf8");
    await verify({ timeout: 60000 })
      .step(() => run("publish-util-prepack", dir))
      .step(() => {
        const p = readPkg(dir);
        expect(p.devDependencies).toBeUndefined();
        expect(p.nyc).toBeUndefined();
        expect(p.scripts.test).toBeUndefined();
        expect(p.scripts.postpack).toBe("publish-util-postpack");
        expect(p.options).toEqual({});
        expect(p.name).toBe(pkg.name);
      })
      .step(() => run("publish-util-postpack", dir))
      .step(() => expect(fs.readFileSync(path.join(dir, "package.json"), "utf8")).toBe(original));
  }, 90000);
});
