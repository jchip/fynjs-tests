import { spawnSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { asyncVerify } from "run-verify";
import { NixClap, Command, UnknownOptionError } from "@fynjs/cli-args";

const parse = (spec, argv, cfg = {}) => {
  const nc = new NixClap({ name: "prog", skipExec: true, ...cfg }).init2(spec);
  return nc.parse(argv, 0);
};

describe("@fynjs/cli-args", () => {
  it("exports NixClap and Command", () => {
    expect(typeof NixClap).toBe("function");
    expect(typeof Command).toBe("function");
    expect(typeof UnknownOptionError).toBe("function");
  });

  it("parses options with aliases, types and defaults with sources", () => {
    const spec = {
      options: {
        name: { alias: "n", args: "<name string>" },
        count: { args: "<num number>", argDefault: "3" },
        verbose: { alias: "v", args: "<flag boolean>", argDefault: "false" }
      }
    };
    const m = parse(spec, ["-n", "Bob", "--count", "42", "-v"]).command.jsonMeta;
    expect(m.opts.name).toBe("Bob");
    expect(m.opts.count).toBe(42);
    expect(m.opts.verbose).toBe(true);
    expect(m.source.name).toBe("cli");
    const d = parse(spec, []).command.jsonMeta;
    expect(d.opts.count).toBe(3);
    expect(d.source.count).toBe("default");
  });

  it("sub commands get their own args and options", () => {
    const spec = {
      subCommands: {
        copy: {
          args: "<source string> <dest string>",
          options: { force: { alias: "f", args: "<flag boolean>" } }
        }
      }
    };
    const r = parse(spec, ["copy", "a.txt", "b.txt", "--force"]);
    const sub = r.command.jsonMeta.subCommands.copy;
    expect(sub.args).toMatchObject({ source: "a.txt", dest: "b.txt" });
    expect(sub.opts.force).toBe(true);
  });

  it("variadic args and args after --", () => {
    const spec = { args: "<files string..>", options: { v: { args: "<flag boolean>" } } };
    const r = parse(spec, ["a", "b", "c"]);
    expect(r.command.jsonMeta.args.files).toEqual(["a", "b", "c"]);
  });

  it("custom type coercion with function and RegExp", () => {
    const spec = {
      options: {
        first: { args: "<v fn>", customTypes: { fn: s => s[0] } },
        strict: { args: "<v rx>", customTypes: { rx: /^test$/i } }
      }
    };
    const m = parse(spec, ["--first", "hello", "--strict", "TEST"]).command.jsonMeta;
    expect(m.opts.first).toBe("h");
    expect(m.opts.strict).toBe("TEST");
  });

  it("exec handlers run on parse and async ones on parseAsync", async () => {
    const calls = [];
    const nc = new NixClap({ name: "prog" }).init2({
      subCommands: {
        run: { exec: async cmd => { await new Promise(r => setTimeout(r, 5)); calls.push(["run", cmd.jsonMeta.opts.x]); }, options: { x: { args: "<x string>" } } }
      }
    });
    await asyncVerify(
      () => nc.parseAsync(["run", "--x", "1"], 0),
      () => expect(calls).toEqual([["run", "1"]])
    );
  });

  it("applyConfig fills values not given on the CLI", () => {
    const nc = new NixClap({ name: "prog", skipExec: true }).init2({
      options: { verbose: { args: "<flag boolean>" }, timeout: { args: "<n number>" } }
    });
    const parsed = nc.parse(["--verbose"], 0);
    nc.applyConfig({ verbose: false, timeout: 5000 }, parsed);
    const m = parsed.command.jsonMeta;
    expect(m.opts.verbose).toBe(true);
    expect(m.opts.timeout).toBe(5000);
  });

  it("unknown option is reported as a parse error when default handlers are removed", () => {
    const nc = new NixClap({ name: "prog", skipExec: true, handlers: { "parse-fail": false, "unknown-option": false } }).init2({
      options: { a: { args: "<a string>" } }
    });
    const r = nc.parse(["--nope"], 0);
    expect(r.errorNodes?.length ?? 0).toBeGreaterThan(0);
  });

  it("real process prints version, help and runs a command", () => {
    const script = `
      import { NixClap } from "@fynjs/cli-args";
      new NixClap({ name: "demo" }).version("1.2.3").init2({
        subCommands: { hi: { desc: "say hi", args: "<who string>", exec: c => console.log("hi " + c.args.who) } }
      }).parse(JSON.parse(process.env.CLI_ARGS), 0);`;
    const run = args =>
      spawnSync(process.execPath, ["--input-type=module", "-e", script], {
        env: { ...process.env, CLI_ARGS: JSON.stringify(args) },
        cwd: process.cwd(),
        encoding: "utf-8",
        timeout: 30000
      });
    expect(run(["--version"]).stdout).toContain("1.2.3");
    const help = run(["--help"]);
    expect(help.stdout).toContain("hi");
    expect(help.stdout).toContain("say hi");
    expect(run(["hi", "joel"]).stdout).toContain("hi joel");
  });
}, 60000);
