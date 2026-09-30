import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { asyncVerify } from "run-verify";
import chalker, { makeChalker } from "chalker";
import styleTextChalker from "chalker/style-text";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;
const strip = s => s.replace(ANSI, "");

describe("chalker", () => {
  it("default export and named exports load", () => {
    expect(typeof chalker).toBe("function");
    expect(typeof chalker.remove).toBe("function");
    expect(typeof chalker.decodeHtml).toBe("function");
    expect(typeof makeChalker).toBe("function");
  });

  it("markers never leak into output text", () => {
    const out = chalker("<red.bgGreen>Hi</> there");
    expect(strip(out)).toBe("Hi there");
  });

  it("style-text entry strips markers (colors depend on TTY)", () => {
    const out = styleTextChalker("<red>hello</red>");
    expect(strip(out)).toBe("hello");
  });

  it("supports template string tagging", () => {
    expect(strip(chalker`<green>hello world</green>`)).toBe("hello world");
  });

  it("remove strips markers and decodes html entities", () => {
    expect(chalker.remove("<red>a &lt;b&gt; &amp; c</red>")).toBe("a <b> & c");
    expect(chalker.remove("<red>&lt;x&gt;</red>", true)).toBe("&lt;x&gt;");
  });

  it("decodeHtml handles named, hex and decimal entities", () => {
    expect(chalker.decodeHtml("&lt;&gt;&quot;&apos;&amp;")).toBe("<>\"'&");
    expect(chalker.decodeHtml("&#65;&#x42;")).toBe("AB");
  });

  it("makeChalker uses a supplied colors module", () => {
    const fake = { red: s => `[R:${s}]` };
    const ck = makeChalker(fake);
    expect(ck("<red>x</red>")).toBe("[R:x]");
    expect(ck.CHALK).toBe(fake);
  });

  it("nested markers keep plain text order", async () => {
    await asyncVerify(
      () => chalker("<bold>a<red>b</red>c</bold>"),
      out => expect(strip(out)).toBe("abc")
    );
  });

  it("CJS require of the async default entry is rejected", () => {
    const require = createRequire(import.meta.url);
    expect(() => require("chalker")).toThrow();
  });
}, 30000);
