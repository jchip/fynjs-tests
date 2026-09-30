import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import Path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { verify } from "run-verify";
import xrunDefault, * as xrunNs from "@fynjs/run";

const require = createRequire(import.meta.url);
const version = require("@fynjs/run/package.json").version;
const runPkgDir = fs.realpathSync(Path.resolve("node_modules/@fynjs/run"));
const xrunBin = Path.resolve("node_modules/.bin/xrun");

const xrun = (args, cwd) =>
  spawnSync(xrunBin, args, { cwd, encoding: "utf8", timeout: 60000, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });

let dir;

beforeAll(() => {
  dir = fs.mkdtempSync(Path.join(os.tmpdir(), "xrun-"));
  fs.mkdirSync(Path.join(dir, "node_modules/@fynjs"), { recursive: true });
  fs.symlinkSync(runPkgDir, Path.join(dir, "node_modules/@fynjs/run"), "dir");
  fs.writeFileSync(
    Path.join(dir, "package.json"),
    JSON.stringify({
      name: "xrun-fixture",
      version: "1.0.0",
      scripts: { hello: "echo npm-hello", boom: "exit 3" }
    })
  );
  fs.writeFileSync(
    Path.join(dir, "xrun-tasks.js"),
    `const { load, exec, concurrent, serial } = require("@fynjs/run");
load({
  one: () => console.log("out-one"),
  two: "echo out-two",
  order: serial("one", "two", exec("echo out-three")),
  both: concurrent("one", "two"),
  fail: () => { throw new Error("task failed on purpose"); },
  withArg: { desc: "print arg", task: () => console.log("arg-task-ran") }
});
`
  );
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("@fynjs/run", { timeout: 120000 }, () => {
  it("exports the task API via ESM", () => {
    const api = xrunNs.default || xrunDefault;
    expect(api).toBeDefined();
    for (const name of ["load", "serial", "concurrent", "exec"]) {
      expect(typeof (api[name] || xrunNs[name])).toBe("function");
    }
  });

  it("supports require() of the main entry", () => {
    const api = require("@fynjs/run");
    expect(typeof api.load).toBe("function");
    expect(typeof api.serial).toBe("function");
  });

  it("xrun prints its version", () => {
    const r = xrun(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(version);
  });

  it("xrun prints help", () => {
    const r = xrun(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Usage: xrun");
    expect(r.stdout).toContain("--serial");
  });

  it("runs an npm script", () => {
    const r = xrun(["hello"], dir);
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain("npm-hello");
  });

  it("runs serial tasks in order", () => {
    const r = xrun(["order"], dir);
    expect(r.status).toBe(0);
    const out = r.stdout;
    const i1 = out.search(/^out-one$/m);
    const i2 = out.search(/^out-two$/m);
    const i3 = out.search(/^out-three$/m);
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it("runs several tasks with --serial and concurrently", () => {
    const s = xrun(["--serial", "one", "two"], dir);
    expect(s.status).toBe(0);
    expect(s.stdout).toContain("out-one");
    expect(s.stdout).toContain("out-two");
    const c = xrun(["both"], dir);
    expect(c.status).toBe(0);
    expect(c.stdout).toContain("out-one");
    expect(c.stdout).toContain("out-two");
  });

  it("lists tasks", () => {
    const r = xrun(["--list"], dir);
    expect(r.status).toBe(0);
    const out = r.stdout + r.stderr;
    expect(out).toContain("order");
    expect(out).toContain("hello");
  });

  it("exits non-zero when a task fails", () => {
    const r = xrun(["fail"], dir);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain("task failed on purpose");
    expect(xrun(["boom"], dir).status).not.toBe(0);
  });

  it("reports an unknown task", async () => {
    await verify({ timeout: 30000 })
      .step(() => xrun(["no-such-task"], dir))
      .step(r => {
        expect(r.status).not.toBe(0);
        expect(r.stdout + r.stderr).toContain("no-such-task");
      });
  });
});
