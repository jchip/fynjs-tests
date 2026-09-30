import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { asyncVerify, expectError } from "run-verify";
import Inflight, { Inflight as NamedInflight, InflightStore } from "xflight";

const require = createRequire(import.meta.url);
const tick = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

describe("xflight", () => {
  it("ESM default and named exports", () => {
    expect(Inflight).toBe(NamedInflight);
    expect(new Inflight()).toBeInstanceOf(InflightStore);
  });

  it("CJS require exposes default", () => {
    const m = require("xflight");
    expect(typeof (m.default || m)).toBe("function");
  });

  it("dedups concurrent calls for same key", async () => {
    const f = new Inflight();
    let calls = 0;
    const factory = () => { calls++; return tick(10, "r"); };
    const p1 = f.promise("k", factory);
    const p2 = f.promise("k", factory);
    expect(p1).toBe(p2);
    expect(f.count).toBe(1);
    expect(f.isEmpty).toBe(false);
    expect(await Promise.all([p1, p2])).toEqual(["r", "r"]);
    expect(calls).toBe(1);
  });

  it("cleans up after resolve so a new call runs the factory", async () => {
    const f = new Inflight();
    let calls = 0;
    await f.promise("k", async () => ++calls);
    expect(f.isEmpty).toBe(true);
    expect(await f.promise("k", async () => ++calls)).toBe(2);
  });

  it("cleans up after rejection", async () => {
    const f = new Inflight();
    await asyncVerify(
      expectError(() => f.promise("k", () => Promise.reject(new Error("no")))),
      (err) => expect(err.message).toBe("no")
    );
    expect(f.isEmpty).toBe(true);
    expect(f.get("k")).toBeUndefined();
  });

  it("different keys run independently", async () => {
    const f = new Inflight();
    const a = f.promise("a", () => tick(5, 1));
    const b = f.promise("b", () => tick(5, 2));
    expect(f.count).toBe(2);
    expect(await Promise.all([a, b])).toEqual([1, 2]);
  });

  it("store add/get/remove and duplicate/missing errors", () => {
    const s = new InflightStore();
    s.add(1, "x", 1000);
    expect(s.get(1)).toBe("x");
    expect(() => s.add(1, "y")).toThrow();
    expect([...s.entries()].length).toBe(1);
    s.remove(1);
    expect(s.isEmpty).toBe(true);
    expect(() => s.remove(1)).toThrow();
  });

  it("timing helpers use supplied clock", () => {
    const s = new InflightStore();
    s.add("k", "v", 1000);
    expect(s.getStartTime("k")).toBe(1000);
    expect(s.time("k", 1500)).toBe(500);
    expect(s.elapseTime("k", 1600)).toBe(600);
    expect(s.lastCheckTime("k", 1700)).toBe(700);
    s.resetCheckTime("k", 1800);
    expect(s.getCheckTime("k")).toBe(1800);
    expect(s.elapseCheckTime("k", 1900)).toBe(100);
    expect(s.time("missing")).toBe(-1);
  });

  it("supports symbol keys", async () => {
    const f = new Inflight();
    const k = Symbol("k");
    expect(await f.promise(k, async () => "sym")).toBe("sym");
  });
});
