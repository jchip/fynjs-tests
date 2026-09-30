import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asyncVerify } from "run-verify";

const bin = name => path.resolve("node_modules", ".bin", name);
const pkgJson = JSON.parse(fs.readFileSync(path.resolve("node_modules/fyn/package.json"), "utf-8"));

const run = (name, args, cwd = process.cwd()) =>
  spawnSync(bin(name), args, {
    cwd,
    encoding: "utf-8",
    timeout: 120000,
    env: { ...process.env, NO_COLOR: "1", CI: "1" }
  });

describe("fyn bins", () => {
  it("installs the fyn, fun and npx-guard bins", () => {
    for (const b of ["fyn", "fun", "0-npx-please-run-this-for-fyn"]) {
      expect(fs.existsSync(bin(b)), b).toBe(true);
    }
  });

  it("fyn --version prints the installed version", () => {
    const r = run("fyn", ["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain(pkgJson.version);
  });

  it("fyn --help lists main commands", () => {
    const r = run("fyn", ["--help"]);
    expect(r.status).toBe(0);
    for (const c of ["install", "add", "remove", "run"]) {
      expect(r.stdout).toContain(c);
    }
  });

  it("fun --help works", () => {
    const r = run("fun", ["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
  });

  it("unknown option exits non-zero", () => {
    const r = run("fyn", ["--no-such-option-xyz"]);
    expect(r.status).not.toBe(0);
  });
});

describe("fyn offline actions", () => {
  let tmp;
  let app;

  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fyn-t-"));
    app = path.join(tmp, "app");
    const loc = path.join(tmp, "loc");
    fs.mkdirSync(app);
    fs.mkdirSync(loc);
    fs.writeFileSync(path.join(loc, "package.json"), JSON.stringify({ name: "loc-pkg", version: "1.0.0", main: "index.js" }));
    fs.writeFileSync(path.join(loc, "index.js"), "module.exports = 42;\n");
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({
        name: "app",
        version: "1.0.0",
        dependencies: { "loc-pkg": "file:../loc" },
        scripts: { hi: "echo hello-from-script" }
      })
    );
  });

  afterAll(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("installs a local file: dependency and can run scripts", async () => {
    await asyncVerify(
      () => run("fyn", ["install"], app),
      r => expect(r.status, r.stdout + r.stderr).toBe(0),
      () => expect(fs.existsSync(path.join(app, "node_modules", "loc-pkg", "package.json"))).toBe(true),
      () => run("fyn", ["run", "hi"], app),
      r => {
        expect(r.status, r.stdout + r.stderr).toBe(0);
        expect(r.stdout + r.stderr).toContain("hello-from-script");
      }
    );
  });

  it("fyn remove drops the dependency", () => {
    const r = run("fyn", ["remove", "loc-pkg"], app);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const pj = JSON.parse(fs.readFileSync(path.join(app, "package.json"), "utf-8"));
    expect(pj.dependencies?.["loc-pkg"]).toBeUndefined();
  });
}, 180000);
