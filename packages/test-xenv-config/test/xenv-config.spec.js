import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import xenvConfig from "xenv-config";

const require = createRequire(import.meta.url);

describe("xenv-config", () => {
  it("ESM default export is a function", () => {
    expect(typeof xenvConfig).toBe("function");
  });

  it("CJS require works", () => {
    const m = require("xenv-config");
    expect(typeof (m.default || m)).toBe("function");
  });

  it("resolves env, option, default and traces sources", () => {
    const spec = {
      fooOption: { env: "FOO_OPTION", default: false },
      barOption: { env: "BAR_OPTION", type: "number" },
      zooOption: { default: false, type: "truthy" },
    };
    const config = xenvConfig(spec, { zooOption: true }, { _env: { BAR_OPTION: "900" } });
    expect(config).toEqual({ fooOption: false, barOption: 900, zooOption: true });
    expect(config.__$trace__).toEqual({
      fooOption: { src: "default" },
      barOption: { src: "env", name: "BAR_OPTION" },
      zooOption: { src: "option" },
    });
    expect(Object.keys(config)).not.toContain("__$trace__");
  });

  it("env takes priority over option and default", () => {
    const c = xenvConfig({ a: { env: "A", default: "d" } }, { a: "o" }, { _env: { A: "e" } });
    expect(c.a).toBe("e");
    expect(xenvConfig({ a: { env: "A", default: "d" } }, { a: "o" }, { _env: {} }).a).toBe("o");
  });

  it("type conversions", () => {
    const spec = {
      i: { env: "I", type: "number" },
      f: { env: "F", type: "float" },
      bt: { env: "BT", type: "boolean" },
      bf: { env: "BF", type: "boolean" },
      j: { env: "J", type: "json" },
      s: { env: "S" },
    };
    const _env = { I: "42abc", F: "3.5", BT: "yes", BF: "nope", J: '{"x":1}', S: "str" };
    const c = xenvConfig(spec, {}, { _env });
    expect(c).toEqual({ i: 42, f: 3.5, bt: true, bf: false, j: { x: 1 }, s: "str" });
  });

  it("env true uses key name, env array uses first found", () => {
    const c = xenvConfig(
      { MY_KEY: { env: true }, other: { env: ["NOPE", "SECOND", "THIRD"] } },
      {},
      { _env: { MY_KEY: "k", SECOND: "2", THIRD: "3" } }
    );
    expect(c.MY_KEY).toBe("k");
    expect(c.other).toBe("2");
    expect(c.__$trace__.other).toEqual({ src: "env", name: "SECOND" });
  });

  it("json values merge env, option and default with trace", () => {
    const c = xenvConfig(
      { j: { env: "J", default: { d: 1, a: 0 } } },
      { j: { a: 50 } },
      { _env: { J: '{"b":90}' } }
    );
    expect(c.j).toMatchObject({ a: 50, b: 90 });
    expect(c.__$trace__.j.src).toContain("env");
    expect(c.__$trace__.j.src).toContain("option");
  });

  it("envMap, function default and post", () => {
    const c = xenvConfig(
      {
        mode: { env: "MODE", envMap: { prod: "production" } },
        gen: { default: () => "generated", type: "string" },
        up: { env: "UP", post: (v) => String(v).toUpperCase() },
      },
      {},
      { _env: { MODE: "prod", UP: "abc" } }
    );
    expect(c.mode).toBe("production");
    expect(c.gen).toBe("generated");
    expect(c.up).toBe("ABC");
  });

  it("reads process.env when _env not given", () => {
    process.env.XENV_TEST_VAR_9 = "77";
    try {
      expect(xenvConfig({ v: { env: "XENV_TEST_VAR_9", type: "number" } }).v).toBe(77);
    } finally {
      delete process.env.XENV_TEST_VAR_9;
    }
  });
});
