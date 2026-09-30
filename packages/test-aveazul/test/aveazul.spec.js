import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { asyncVerify, expectError } from "run-verify";
import AveAzul, { OperationalError, isOperationalError, promisify } from "aveazul";

describe("aveazul", () => {
  it("exposes named and default ESM exports", () => {
    expect(typeof AveAzul).toBe("function");
    expect(typeof OperationalError).toBe("function");
    expect(typeof promisify).toBe("function");
  });

  it("CJS require returns the AveAzul class with named exports attached", () => {
    const require = createRequire(import.meta.url);
    const cjs = require("aveazul");
    expect(typeof cjs).toBe("function");
    expect(typeof cjs.resolve).toBe("function");
    expect(typeof cjs.OperationalError).toBe("function");
  });

  it("resolve/then/map/reduce chain", async () => {
    await asyncVerify(
      () => AveAzul.resolve(2).then(x => x * 3),
      v => expect(v).toBe(6),
      () => AveAzul.map([1, 2, 3], x => x * 2),
      v => expect(v).toEqual([2, 4, 6]),
      () => AveAzul.reduce([1, 2, 3], (a, x) => a + x, 0),
      v => expect(v).toBe(6),
      () => AveAzul.mapSeries([1, 2], async x => x + 1),
      v => expect(v).toEqual([2, 3])
    );
  });

  it("props and all resolve nested promises", async () => {
    const p = await AveAzul.props({ a: Promise.resolve(1), b: 2 });
    expect(p).toEqual({ a: 1, b: 2 });
    expect(await AveAzul.all([1, Promise.resolve(2)])).toEqual([1, 2]);
  });

  it("catch, tap, and return", async () => {
    let tapped;
    const r = await AveAzul.resolve(5)
      .tap(v => {
        tapped = v;
      })
      .return("done");
    expect(tapped).toBe(5);
    expect(r).toBe("done");
    const c = await AveAzul.reject(new Error("boom")).catch(e => e.message);
    expect(c).toBe("boom");
  });

  it("rejections propagate and are verifiable", async () => {
    await asyncVerify(
      expectError(() => AveAzul.reject(new Error("nope"))),
      err => expect(err.message).toBe("nope"),
      expectError(() => AveAzul.try(() => { throw new TypeError("bad"); })),
      err => expect(err).toBeInstanceOf(TypeError)
    );
  });

  it("timeout rejects a slow promise", async () => {
    await asyncVerify(
      expectError(() => AveAzul.delay(500).timeout(20)),
      err => expect(err).toBeInstanceOf(Error)
    );
  });

  it("delay resolves with value", async () => {
    expect(await AveAzul.delay(10, "x")).toBe("x");
  });

  it("promisify and fromCallback wrap node style callbacks", async () => {
    const fn = (a, cb) => setTimeout(() => cb(null, a + 1), 1);
    expect(await promisify(fn)(1)).toBe(2);
    expect(await AveAzul.fromCallback(cb => cb(null, "ok"))).toBe("ok");
    const bad = promisify((cb) => cb(new Error("cb fail")));
    await expect(bad()).rejects.toThrow("cb fail");
  });

  it("defer resolves externally, OperationalError is flagged", async () => {
    const d = AveAzul.defer();
    setTimeout(() => d.resolve(9), 1);
    expect(await d.promise).toBe(9);
    expect(isOperationalError(new OperationalError("x"))).toBe(true);
    expect(isOperationalError(new Error("x"))).toBe(false);
  });
}, 30000);
