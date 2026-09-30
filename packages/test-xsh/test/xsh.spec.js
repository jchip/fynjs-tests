import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asyncVerify, expectError } from "run-verify";
import xsh, { exec, env, envPath, mkCmd, pathCwd, pushd, popd } from "xsh";

const require = createRequire(import.meta.url);
const isWin = process.platform === "win32";

describe("xsh", () => {
  it("ESM default and named exports agree", () => {
    expect(xsh.exec).toBe(exec);
    expect(xsh.mkCmd).toBe(mkCmd);
    expect(xsh.envPath).toBe(envPath);
  });

  it("CJS require returns the xsh object", () => {
    const m = require("xsh");
    expect(typeof m.exec).toBe("function");
    expect(typeof m.mkCmd).toBe("function");
  });

  it("mkCmd joins strings and arrays", () => {
    expect(mkCmd(["echo", "hello"])).toBe("echo hello");
    expect(mkCmd("echo", "hello")).toBe("echo hello");
  });

  it("exec resolves stdout and merges fragments", async () => {
    await asyncVerify(
      () => exec("echo", ["hello", "world"], { silent: true }),
      (r) => expect(r.stdout.trim()).toBe("hello world"),
      () => exec("echo hi", true).promise,
      (r) => expect(r.stdout.trim()).toBe("hi")
    );
  }, 30000);

  it("exec rejects with code and output on failure", async () => {
    await asyncVerify(
      expectError(() => exec("echo oops 1>&2; exit 3", true)),
      (err) => {
        expect(err.code).toBe(3);
        expect(err.output.stderr).toContain("oops");
      }
    );
  }, 30000);

  it("exec honors cwd and exposes child", async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "xsh-")));
    try {
      const x = exec(isWin ? "cd" : "pwd", { cwd: dir, silent: true });
      expect(typeof x.child.pid).toBe("number");
      const r = await x;
      expect(r.stdout.trim()).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);

  it("exec with callback returns child and calls back", async () => {
    const out = await new Promise((resolve, reject) => {
      exec("echo cb", true, (err, o) => (err ? reject(err) : resolve(o)));
    });
    expect(out.stdout.trim()).toBe("cb");
  }, 30000);

  it("env getters", () => {
    process.env.XSH_T_BOOL = "Yes";
    process.env.XSH_T_INT = "12";
    try {
      expect(env.get("XSH_T_INT")).toBe("12");
      expect(env.get("XSH_T_NOPE", "dflt")).toBe("dflt");
      expect(env.getAsBool("XSH_T_BOOL")).toBe(true);
      expect(env.getAsBool("XSH_T_NOPE", true)).toBe(true);
      expect(env.getAsInt("XSH_T_INT")).toBe(12);
      expect(env.getAsInt("XSH_T_NOPE", 5)).toBe(5);
    } finally {
      delete process.env.XSH_T_BOOL;
      delete process.env.XSH_T_INT;
    }
  });

  it("envPath add functions on a custom env", () => {
    const d = path.delimiter;
    const key = envPath.envKey;
    const e = { [key]: ["/a", "/b"].join(d) };
    expect(envPath.addToFront("/c", e)).toBe(["/c", "/a", "/b"].join(d));
    expect(envPath.addToEnd("/a", { [key]: ["/a", "/b"].join(d) })).toBe(["/b", "/a"].join(d));
    expect(envPath.add("/b", { [key]: ["/a", "/b"].join(d) })).toBe(["/a", "/b"].join(d));
    expect(envPath.add("/z", ["/a"].join(d))).toBe(["/a", "/z"].join(d));
  });

  it("pushd and popd change and restore cwd", () => {
    const orig = process.cwd();
    const dir = fs.realpathSync(os.tmpdir());
    try {
      expect(fs.realpathSync(pushd(dir))).toBe(dir);
      expect(fs.realpathSync(process.cwd())).toBe(dir);
      popd();
      expect(process.cwd()).toBe(orig);
      expect(() => popd()).toThrow();
    } finally {
      process.chdir(orig);
    }
  });

  it("pathCwd replace and remove", () => {
    const p = path.join(process.cwd(), "a", "b");
    expect(pathCwd.replace(p)).toBe(`CWD${path.sep}a${path.sep}b`);
    expect(pathCwd.remove(p)).toBe(`${path.sep}a${path.sep}b`);
  });
});
