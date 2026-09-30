import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verify } from "run-verify";
import { makeOptionalImport, tryImport, tryResolve } from "optional-import";

// a bare specifier resolved from this file, so use file URLs for temp modules
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "optional-import-"));
const write = (name, code) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, code);
  return pathToFileURL(f).href;
};

describe("optional-import", () => {
  it("exports the API", () => {
    expect(typeof makeOptionalImport).toBe("function");
    expect(typeof tryImport).toBe("function");
    expect(typeof tryResolve).toBe("function");
  });

  it("imports an installed package", async () => {
    const oi = makeOptionalImport(import.meta);
    const mod = await oi("run-verify");
    expect(typeof mod.runVerify).toBe("function");
    expect(oi.has("run-verify")).toBe(true);
  });

  it("returns undefined for a missing package, default when given", async () => {
    const oi = makeOptionalImport(import.meta);
    expect(await oi("no-such-pkg-xyz")).toBeUndefined();
    expect(oi.has("no-such-pkg-xyz")).toBe(false);
    expect(await oi("no-such-pkg-xyz", { default: 42 })).toBe(42);
  });

  it("calls notFound and logs the message", async () => {
    const logs = [];
    const oi = makeOptionalImport(import.meta, (m, s) => logs.push([m, s]));
    let called;
    await oi("no-such-pkg-xyz", { notFound: e => (called = e) });
    expect(called).toBeInstanceOf(Error);
    await oi("no-such-pkg-xyz", "missing optional");
    expect(logs.length).toBe(1);
    expect(logs[0][1]).toBe("no-such-pkg-xyz");
  });

  it("tryResolve resolves synchronously", () => {
    expect(tryResolve(import.meta, "run-verify")).toMatch(/run-verify/);
    expect(tryResolve(import.meta, "no-such-pkg-xyz", { default: "d" })).toBe("d");
  });

  it("imports a file URL and detects a missing file", async () => {
    const url = write("ok.mjs", "export const v = 7;");
    expect((await tryImport(import.meta, url)).v).toBe(7);
    const missing = pathToFileURL(path.join(tmp, "nope.mjs")).href;
    expect(await tryImport(import.meta, missing, { default: "gone" })).toBe("gone");
  });

  it("a broken installed module is not treated as missing", async () => {
    const url = write("broken.mjs", "throw new Error('broken at load');");
    await verify({ timeout: 2000 })
      .expectErrorHas("broken at load")
      .step(() => tryImport(import.meta, url, { default: "should not be used" }));
    const seen = await tryImport(import.meta, url, { fail: e => e.message });
    expect(seen).toBe("broken at load");
  });
});
