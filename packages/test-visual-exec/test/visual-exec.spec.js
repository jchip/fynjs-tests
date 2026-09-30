import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asyncVerify, expectError } from "run-verify";
import VisualLogger from "visual-logger";
import VisualExec, { VisualExec as Named, getDefaultLogger, parsers, jsonLinesParser, keyValueParser } from "visual-exec";

const require = createRequire(import.meta.url);
const T = 30000;

// quiet non-TTY logger so tests don't scribble on the console
function quietLogger() {
  const output = {
    isTTY: () => false,
    write: () => true,
    visual: { write: () => {}, clear: () => {} },
  };
  const l = new VisualLogger({ output, color: false });
  l.setItemType("none");
  return l;
}
const mk = (command, extra = {}) => new VisualExec({ command, visualLogger: quietLogger(), ...extra });
const node = (code) => `"${process.execPath}" -e "${code}"`;

describe("visual-exec", () => {
  it("ESM default and named exports", () => {
    expect(VisualExec).toBe(Named);
    expect(typeof getDefaultLogger).toBe("function");
    expect(parsers.jsonLines).toBe(jsonLinesParser);
    expect(parsers.keyValue).toBe(keyValueParser);
  });

  it("CJS require works", () => {
    const m = require("visual-exec");
    expect(typeof (m.VisualExec || m.default || m)).toBe("function");
  });

  it("getDefaultLogger returns a VisualLogger", () => {
    expect(getDefaultLogger()).toBeInstanceOf(VisualLogger);
  });

  it("parsers", () => {
    expect(jsonLinesParser('{"a":1}')).toEqual({ a: 1 });
    expect(jsonLinesParser("not json")).toBeNull();
    expect(keyValueParser("name=joe")).toEqual({ name: "joe" });
    expect(keyValueParser("name: joe")).toEqual({ name: "joe" });
  });

  it("execute resolves stdout", async () => {
    await asyncVerify(
      () => mk(node("console.log('hello-ve')")).execute(),
      (r) => expect(r.stdout).toContain("hello-ve")
    );
  }, T);

  it("execute honors cwd", async () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "vexec-")));
    try {
      const r = await mk(node("console.log(process.cwd())"), { cwd: dir }).execute();
      expect(r.stdout.trim()).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, T);

  it("failure throws with exitCode, stdout, stderr and command", async () => {
    const cmd = node("console.log('out1');console.error('err1');process.exit(4)");
    await asyncVerify(
      expectError(() => mk(cmd).execute()),
      (err) => {
        expect(err.exitCode).toBe(4);
        expect(err.stderr).toContain("err1");
        expect(err.stdout).toContain("out1");
        expect(err.command).toBe(cmd);
      }
    );
  }, T);

  it("onOutput and onComplete", async () => {
    const chunks = [];
    const r = await mk(node("console.log('chunk-a')"), {
      onOutput: (d, s) => chunks.push([s, d]),
      onComplete: (out, code) => ({ code, len: out.stdout.length > 0 }),
    }).execute();
    expect(r).toEqual({ code: 0, len: true });
    expect(chunks.some(([s, d]) => s === "stdout" && d.includes("chunk-a"))).toBe(true);
  }, T);

  it("outputFile receives output", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vexec-"));
    const file = path.join(dir, "out.log");
    try {
      await mk(node("console.log('to-file')"), { outputFile: file }).execute();
      await new Promise((r) => setTimeout(r, 50));
      expect(fs.readFileSync(file, "utf8")).toContain("to-file");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, T);

  it("timeout kills a long running command", async () => {
    const start = Date.now();
    await asyncVerify(
      expectError(() => mk(node("setTimeout(()=>{},60000)"), { timeout: 300, timeoutGrace: 300 }).execute())
    );
    expect(Date.now() - start).toBeLessThan(20000);
  }, T);

  it("progress extraction reports percent", async () => {
    const seen = [];
    await mk(node("console.log('50% done');console.log('100% done')"), {
      progress: { pattern: /(?<percent>\d+)%/ },
      onProgress: (p) => seen.push(p.percent),
    }).execute();
    expect(seen.length).toBeGreaterThan(0);
  }, T);
});
