import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { verify } from "run-verify";
import DefaultPreper, { PkgPreper } from "pkg-preper";

const mkdir = p => fs.mkdtempSync(path.join(os.tmpdir(), `pkg-preper-${p}-`));

const makePkg = (scripts) => {
  const dir = mkdir("src");
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "demo-pkg", version: "1.2.3", files: ["lib"], scripts })
  );
  fs.mkdirSync(path.join(dir, "lib"));
  fs.writeFileSync(path.join(dir, "lib", "a.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(dir, "ignored.txt"), "not packed\n");
  return dir;
};

const listTar = file => execFileSync("tar", ["-tzf", file]).toString().split("\n").filter(Boolean);

describe("pkg-preper", () => {
  it("exports PkgPreper as named and default", () => {
    expect(DefaultPreper).toBe(PkgPreper);
    const p = new PkgPreper({ tmpDir: os.tmpdir(), installDependencies: async () => {} });
    expect(typeof p.packDirectory).toBe("function");
    expect(typeof p.getDirPackerCb()).toBe("function");
  });

  it("packDirectory writes a tgz with package/ prefix and honors files", async () => {
    const dir = makePkg({});
    const target = path.join(mkdir("out"), "demo.tgz");
    const p = new PkgPreper({ tmpDir: mkdir("tmp"), installDependencies: async () => {} });
    await verify({ timeout: 20000 })
      .step(() => p.packDirectory({}, dir, target))
      .step(() => {
        const files = listTar(target);
        expect(files).toContain("package/package.json");
        expect(files).toContain("package/lib/a.js");
        expect(files.join("\n")).not.toContain("ignored.txt");
      });
  }, 30000);

  it("depDirPacker runs installDependencies when prepare exists", async () => {
    const dir = makePkg({ prepare: "echo hi" });
    const calls = [];
    const p = new PkgPreper({
      tmpDir: mkdir("tmp"),
      installDependencies: async (d, msg) => calls.push([d, msg])
    });
    const stream = p.depDirPacker({ _resolved: "github:x/y" }, dir);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(dir);
    expect(calls[0][1]).toContain("demo-pkg");
    expect(calls[0][1]).toContain("github:x/y");
    const out = path.join(mkdir("out"), "s.tgz");
    fs.writeFileSync(out, Buffer.concat(chunks));
    expect(listTar(out)).toContain("package/lib/a.js");
  }, 30000);

  it("depDirPacker skips install without a prepare script", async () => {
    const dir = makePkg({ test: "x" });
    let called = false;
    const p = new PkgPreper({
      tmpDir: mkdir("tmp"),
      installDependencies: async () => (called = true)
    });
    for await (const _ of p.getDirPackerCb()({}, dir)) void _;
    expect(called).toBe(false);
  }, 30000);

  it("depDirPacker emits an error for a missing package.json", async () => {
    const p = new PkgPreper({ tmpDir: mkdir("tmp"), installDependencies: async () => {} });
    const stream = p.depDirPacker({}, mkdir("empty"));
    await verify({ timeout: 5000 })
      .expectErrorHas("package.json")
      .step(async () => {
        for await (const _ of stream) void _;
      });
  });
});
