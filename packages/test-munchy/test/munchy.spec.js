import { describe, it, expect } from "vitest";
import { Readable, PassThrough } from "node:stream";
import { verify } from "run-verify";
import DefaultMunchy, { Munchy } from "munchy";

const collect = async stream => {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString();
};

describe("munchy", () => {
  it("named and default exports match", () => {
    expect(DefaultMunchy).toBe(Munchy);
    expect(new Munchy()).toBeInstanceOf(Readable);
  });

  it("drains strings and buffers, null terminates", async () => {
    const m = new Munchy("hello ", Buffer.from("world"), null);
    expect(await collect(m)).toBe("hello world");
  });

  it("munch() appends sources and returns this", async () => {
    const m = new Munchy();
    expect(m.munch("a")).toBe(m);
    m.munch("b", null);
    expect(await collect(m)).toBe("ab");
  });

  it("drains Readable streams in order", async () => {
    const m = new Munchy({}, Readable.from(["x", "y"]), "-", Readable.from(["z"]), null);
    expect(await collect(m)).toBe("xy-z");
  });

  it("handles async iterables, promises and iterables", async () => {
    async function* gen() {
      yield "1";
      yield "2";
    }
    const m = new Munchy(gen(), Promise.resolve("3"), ["4", "5"], null);
    expect(await collect(m)).toBe("12345");
  });

  it("handleStreamError recovers from a failing stream", async () => {
    const bad = new PassThrough();
    const m = new Munchy(
      { handleStreamError: err => ({ result: `[${err.message}]`, remit: false }) },
      "a",
      bad,
      "b",
      null
    );
    setTimeout(() => bad.destroy(new Error("bad")), 20);
    expect(await collect(m)).toBe("a[bad]b");
  });

  it("emits the error without handler", async () => {
    const m = new Munchy(Promise.reject(new Error("nope")), null);
    await verify({ timeout: 2000 })
      .expectErrorHas("nope")
      .step(() => collect(m));
  });

  it("emits draining, drained and munched events", async () => {
    const m = new Munchy();
    const events = [];
    ["draining", "drained", "munched"].forEach(e => m.on(e, () => events.push(e)));
    m.munch(Readable.from(["q"]));
    m.resume();
    await new Promise(r => setTimeout(r, 100));
    m.munch(null);
    expect(events).toContain("draining");
    expect(events).toContain("drained");
    expect(events).toContain("munched");
  });
});
