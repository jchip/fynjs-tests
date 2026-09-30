import { describe, it, expect } from "vitest";
import { verify } from "run-verify";
import { cleanErrorStack, aggregateErrorStack, aggregateStack, AggregateError } from "@jchip/error";

describe("@jchip/error", () => {
  it("exports the public API", () => {
    expect(typeof cleanErrorStack).toBe("function");
    expect(typeof aggregateErrorStack).toBe("function");
    expect(typeof aggregateStack).toBe("function");
    expect(typeof AggregateError).toBe("function");
  });

  it("cleanErrorStack keeps message and drops node internals", async () => {
    await verify({ timeout: 2000 })
      .step(() => {
        try {
          return import("node:no-such-module-xyz").catch(e => e);
        } catch (e) {
          return e;
        }
      })
      .step(err => {
        const s = cleanErrorStack(err);
        expect(typeof s).toBe("string");
        expect(s).toContain(err.message.split("\n")[0]);
        expect(s).not.toContain("node:internal/");
      });
  });

  it("cleanErrorStack honors ignorePathFilter", () => {
    const err = new Error("boom");
    err.stack = "Error: boom\n    at foo (/a/keep/x.js:1:1)\n    at bar (/a/skip/y.js:2:2)";
    const s = cleanErrorStack(err, { ignorePathFilter: [/skip/] });
    expect(s).toContain("keep/x.js");
    expect(s).not.toContain("skip/y.js");
  });

  it("AggregateError collects errors and builds aggregate stack", () => {
    const e1 = new Error("one");
    const e2 = new Error("two");
    const agg = new AggregateError([e1, e2], "many failed");
    expect(agg).toBeInstanceOf(Error);
    expect(agg.name).toBe("AggregateError");
    expect(agg.message).toBe("many failed");
    expect(agg.errors).toEqual([e1, e2]);
    expect(agg.stack).toContain("one");
    expect(agg.stack).toContain("two");
    expect(typeof agg.__stack).toBe("string");
  });

  it("aggregateErrorStack works on a native AggregateError", () => {
    const native = new globalThis.AggregateError([new Error("inner-a")], "outer");
    const s = aggregateErrorStack(native);
    expect(s).toContain("outer");
    expect(s).toContain("inner-a");
  });

  it("aggregateStack appends aggregated errors to a stack", () => {
    const s = aggregateStack("Error: top\n    at x", [new Error("child-1")]);
    expect(s).toContain("Error: top");
    expect(s).toContain("child-1");
  });
});
