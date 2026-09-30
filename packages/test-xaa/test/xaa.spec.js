import { describe, it, expect } from "vitest";
import * as xaa from "xaa";
import { delay } from "xaa";
import { asyncVerify, expectError } from "run-verify";

describe("xaa", () => {
  it("ESM named exports exist", () => {
    for (const k of ["delay", "map", "mapSeries", "each", "filter", "tryCatch", "wrap", "timeout", "runTimeout", "makeDefer", "isPromise", "Defer", "TimeoutError"]) {
      expect(xaa[k], k).toBeDefined();
    }
    expect(xaa.try).toBe(xaa.tryCatch);
    expect(xaa.defer).toBe(xaa.makeDefer);
  });

  it("delay resolves with value or function result", async () => {
    await asyncVerify(
      () => delay(5, "v"),
      (v) => expect(v).toBe("v"),
      () => delay(5, async () => 42),
      (v) => expect(v).toBe(42)
    );
  });

  it("map keeps order with concurrency", async () => {
    const r = await xaa.map([30, 1, 10], async (x) => { await delay(x); return x * 2; }, { concurrency: 3 });
    expect(r).toEqual([60, 2, 20]);
  });

  it("mapSeries runs one at a time", async () => {
    let active = 0, maxActive = 0;
    const r = await xaa.mapSeries([1, 2, 3], async (x) => {
      maxActive = Math.max(maxActive, ++active);
      await delay(3);
      active--;
      return x + 1;
    });
    expect(r).toEqual([2, 3, 4]);
    expect(maxActive).toBe(1);
  });

  it("map rejects with partial results on failure", async () => {
    await asyncVerify(
      expectError(() => xaa.map([1, 2, 3], async (x) => { if (x === 3) throw new Error("bad"); return x; }, { concurrency: 1 })),
      (err) => {
        expect(err.message).toBe("bad");
        expect(err.partial).toEqual([1, 2]);
      }
    );
  });

  it("each and filter", async () => {
    const seen = [];
    await xaa.each([1, 2, 3], async (x) => { seen.push(x); });
    expect(seen).toEqual([1, 2, 3]);
    expect(await xaa.filter([1, 2, 3, 4], async (x) => x % 2 === 0)).toEqual([2, 4]);
  });

  it("tryCatch returns fallback value or handler result", async () => {
    expect(await xaa.tryCatch(async () => { throw new Error("x"); }, "fb")).toBe("fb");
    expect(await xaa.tryCatch(Promise.reject(new Error("y")), (e) => e.message)).toBe("y");
    expect(await xaa.tryCatch(async () => 5, "fb")).toBe(5);
  });

  it("wrap converts sync throw into rejection", async () => {
    expect(await xaa.wrap((a, b) => a + b, 1, 2)).toBe(3);
    await asyncVerify(expectError(() => xaa.wrap(() => { throw new Error("boom"); })));
  });

  it("timeout rejects with TimeoutError, runTimeout passes fast tasks", async () => {
    await asyncVerify(
      expectError(() => xaa.runTimeout(() => delay(500), 20, "too slow")),
      (err) => {
        expect(err).toBeInstanceOf(xaa.TimeoutError);
        expect(err.message).toContain("too slow");
      },
      () => xaa.runTimeout(() => delay(1, "ok"), 500),
      (v) => expect(v).toBe("ok"),
      () => xaa.runTimeout([delay(1, "a"), delay(2, "b")], 500),
      (v) => expect(v).toEqual(["a", "b"])
    );
  });

  it("defer resolves later", async () => {
    const d = xaa.makeDefer();
    expect(xaa.isPromise(d.promise)).toBe(true);
    setTimeout(() => d.resolve("done"), 5);
    expect(await d.promise).toBe("done");
    const d2 = xaa.defer();
    d2.done(new Error("cb"));
    await asyncVerify(expectError(() => d2.promise));
  });
});
