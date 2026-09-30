import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import Path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { verify } from "run-verify";

const require = createRequire(import.meta.url);
const bin = Path.resolve("node_modules/.bin/fynpo");
const version = require("fynpo-cli/package.json").version;

const fynpo = (args, cwd) =>
  spawnSync(bin, args, { cwd, encoding: "utf8", timeout: 60000, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });

const write = (dir, rel, data) => {
  const f = Path.join(dir, rel);
  fs.mkdirSync(Path.dirname(f), { recursive: true });
  fs.writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data, null, 2));
};

// the launcher delegates to the fynpo installed at the monorepo top
const linkFynpo = dir => {
  fs.mkdirSync(Path.join(dir, "node_modules"), { recursive: true });
  fs.symlinkSync(fs.realpathSync(Path.resolve("node_modules/fynpo")), Path.join(dir, "node_modules/fynpo"), "dir");
};

let repo;

beforeAll(() => {
  repo = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-cli-pkg-"));
  write(repo, "fynpo.json", { command: { bootstrap: {} } });
  write(repo, "package.json", { name: "root", version: "0.0.0", private: true });
  linkFynpo(repo);
  write(repo, "packages/a/package.json", {
    name: "pkg-a",
    version: "1.0.0",
    scripts: { hello: "echo hello-from-a" }
  });
  write(repo, "packages/b/package.json", {
    name: "pkg-b",
    version: "1.0.0",
    dependencies: { "pkg-a": "^1.0.0" },
    scripts: { hello: "echo hello-from-b" }
  });
});

afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

describe("fynpo bin", { timeout: 120000 }, () => {
  it("prints its version", () => {
    const r = fynpo(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(version);
  });

  it("explains when fynpo is not installed in the current dir", () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-none-"));
    try {
      const r = fynpo(["run", "hello"], dir);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain("Unable to find the fynpo module");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints help with the main commands", () => {
    const r = fynpo(["--help"]);
    expect(r.status).toBe(0);
    for (const c of ["bootstrap", "local", "prepare", "updated", "run", "publish", "init"]) {
      expect(r.stdout).toContain(c);
    }
  });

  it("prints help for a sub command", () => {
    const r = fynpo(["run", "--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/script/i);
  });

  it("runs an npm script in each package, dependencies first", () => {
    const r = fynpo(["run", "hello"], repo);
    const out = r.stdout + r.stderr;
    expect(r.status).toBe(0);
    expect(out).toContain("hello-from-a");
    expect(out).toContain("hello-from-b");
    expect(out.indexOf("hello-from-a")).toBeLessThan(out.indexOf("hello-from-b"));
  });

  it("skips packages with --ignore", () => {
    const r = fynpo(["run", "hello", "--ignore", "pkg-b"], repo);
    const out = r.stdout + r.stderr;
    expect(out).toContain("hello-from-a");
    expect(out).not.toContain("hello-from-b");
  });

  it("init creates a fynpo config in an empty git repo", () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-init-"));
    try {
      spawnSync("git", ["init", "-q"], { cwd: dir });
      linkFynpo(dir);
      write(dir, "package.json", { name: "fresh", version: "0.0.0", private: true });
      const r = fynpo(["init"], dir);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      const names = fs.readdirSync(dir);
      expect(names.some(n => /^fynpo\.(json|config\.js)$/.test(n))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports a broken fynpo.json cleanly without a stack trace", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fynpo-bad-"));
    try {
      linkFynpo(dir);
      write(dir, "fynpo.json", "{ nope,, }");
      const r = fynpo(["run", "hello"], dir);
      const out = r.stdout + r.stderr;
      expect(r.status).not.toBe(0);
      expect(out).toContain("fynpo.json");
      expect(out).not.toMatch(/\n\s+at .*\(.*:\d+:\d+\)/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bounded step check via run-verify", async () => {
    await verify({ timeout: 30000 })
      .step(() => fynpo(["--version"]))
      .step(r => expect(r.stdout.trim()).toBe(version));
  });
});
