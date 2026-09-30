import { describe, it, expect } from "vitest";
import { verify, expectError } from "run-verify";
import * as stringArray from "string-array";
import { parse } from "string-array";

describe("string-array", () => {
  it("exports parse", () => {
    expect(typeof parse).toBe("function");
    expect(stringArray.parse).toBe(parse);
  });

  it("parses empty and empty array", () => {
    expect(parse("")).toEqual({ prefix: "", array: [], remain: "" });
    expect(parse("[]")).toEqual({ prefix: "", array: [], remain: "" });
  });

  it("parses prefix and quotes stay in elements", () => {
    expect(parse("test[1,2,3]")).toEqual({ prefix: "test", array: ["1", "2", "3"], remain: "" });
    expect(parse('test[1,2,"3"]').array).toEqual(["1", "2", '"3"']);
  });

  it("parses nested arrays with trailing text", () => {
    const r = parse("[hello, world, [ [ foo, bar ], 1, [ 2 ], 3 ] ] some other stuff [blah]");
    expect(r).toEqual({
      prefix: "",
      array: ["hello", "world", [["foo", "bar"], "1", ["2"], "3"]],
      remain: "some other stuff [blah]"
    });
  });

  it("trims whitespace around elements", () => {
    expect(parse("[  a ,\t b  ]").array).toEqual(["a", "b"]);
  });

  it("noPrefix and noExtra flags", async () => {
    await verify({ timeout: 1000 })
      .step(expectError(() => parse("pre[a]", true)))
      .step(expectError(() => parse("[a] extra", false, true)))
      .step(() => expect(parse("[a] extra").remain).toBe("extra"));
  });

  it("throws on unbalanced brackets", async () => {
    await verify({ timeout: 1000 })
      .expectErrorHas("array missing ]")
      .step(() => parse("[a, [b]"))
      .expectErrorHas("extra data at end of array")
      .step(() => parse("[a]]", false, true));
  });
});
