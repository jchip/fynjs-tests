import { describe, it, expect } from "vitest";
import { runVerify, asyncVerify, verify, expectError, expectErrorHas, runTimeout, runDefer, runFinally, wrapCheck } from "run-verify";

describe("run-verify", () => {
  it("exports the API", () => {
    for (const f of [runVerify, asyncVerify, verify, expectError, expectErrorHas, runTimeout, runDefer]) {
      expect(typeof f).toBe("function");
    }
  });

  it("verify chain passes values between steps", async () => {
    const r = await verify({ timeout: 500 })
      .step(() => 2)
      .step(v => v * 3)
      .keep.step(v => expect(v).toBe(6))
      .step(v => `count=${v}`);
    expect(r).toBe("count=6");
  });

  it("asyncVerify runs steps in order", async () => {
    const order = [];
    await asyncVerify(
      () => order.push(1),
      async () => {
        await new Promise(r => setTimeout(r, 10));
        order.push(2);
      },
      () => order.push(3)
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it("runVerify calls back on success and reports errors", async () => {
    await new Promise((resolve, reject) => {
      runVerify(
        () => 1,
        () => {
          throw new Error("step failed");
        },
        err => (err && err.message === "step failed" ? resolve() : reject(new Error("unexpected")))
      );
    });
  });

  it("expectError turns an expected failure into a result", async () => {
    const err = await asyncVerify(expectError(() => {
      throw new Error("expected boom");
    }));
    expect(err.message).toBe("expected boom");
  });

  it("expectError fails when the step succeeds", async () => {
    await expect(asyncVerify(expectError(() => 1))).rejects.toThrow();
  });

  it("expectErrorHas checks the message", async () => {
    await asyncVerify(expectErrorHas(() => {
      throw new Error("has needle inside");
    }, "needle"));
    await expect(
      asyncVerify(expectErrorHas(() => {
        throw new Error("other");
      }, "needle"))
    ).rejects.toThrow();
  });

  it("runDefer resolves later", async () => {
    const defer = runDefer();
    setTimeout(() => defer.resolve("deferred"), 10);
    expect(await asyncVerify(defer)).toBe("deferred");
  });

  it("verify timeout rejects a hung step", async () => {
    await expect(
      verify({ timeout: 50 }).step(() => new Promise(() => {}))
    ).rejects.toThrow();
  });

  it("runFinally runs after failure", async () => {
    let ran = false;
    await expect(
      asyncVerify(
        runFinally(() => {
          ran = true;
        }),
        () => {
          throw new Error("x");
        }
      )
    ).rejects.toThrow("x");
    expect(ran).toBe(true);
  });
});
