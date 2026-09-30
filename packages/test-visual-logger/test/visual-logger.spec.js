import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import VisualLogger, { VisualLogger as Named, Levels, LevelColors, LogItemTypes, defaultOutput } from "visual-logger";

const require = createRequire(import.meta.url);

// non-TTY capture output, no timers left running
function mkLogger(extra = {}) {
  const writes = [];
  const output = {
    isTTY: () => false,
    write: (t) => (writes.push(t), true),
    visual: { write: (t) => writes.push(t), clear: () => {} },
  };
  const logger = new VisualLogger({ output, color: false, saveLogs: true, ...extra });
  return { logger, writes };
}

describe("visual-logger", () => {
  it("ESM default and named export", () => {
    expect(VisualLogger).toBe(Named);
    expect(typeof defaultOutput.write).toBe("function");
    expect(typeof defaultOutput.isTTY).toBe("function");
  });

  it("CJS require exposes VisualLogger", () => {
    const m = require("visual-logger");
    expect(typeof (m.VisualLogger || m.default || m)).toBe("function");
  });

  it("Levels, colors and item types", () => {
    expect(Levels).toMatchObject({ debug: 10, verbose: 20, info: 30, warn: 40, error: 50, fyi: 60, none: 100 });
    for (const k of Object.keys(Levels)) expect(LevelColors[k], k).toBeDefined();
    expect(LogItemTypes).toMatchObject({ normal: 9, simple: 1, none: 0 });
    expect(VisualLogger.Levels).toBe(Levels);
    expect(VisualLogger.spinners.length).toBeGreaterThan(0);
  });

  it("logs lines at each level and chains", () => {
    const { logger, writes } = mkLogger();
    const r = logger.info("hello", "world").warn("careful").error("bad").fyi("note");
    expect(r).toBe(logger);
    const all = writes.join("");
    for (const s of ["hello world", "careful", "bad", "note"]) expect(all).toContain(s);
    expect(logger.logData.join("\n")).toContain("hello world");
    logger.shutdown();
  });

  it("debug and verbose are hidden by default, info shown", () => {
    const { logger, writes } = mkLogger();
    logger.debug("dbg-msg").verbose("verb-msg").info("info-msg");
    const all = writes.join("");
    expect(all).not.toContain("dbg-msg");
    expect(all).not.toContain("verb-msg");
    expect(all).toContain("info-msg");
    logger.shutdown();
  });

  it("prefix applies to subsequent lines", () => {
    const { logger, writes } = mkLogger();
    logger.setPrefix("[pfx] ").info("with prefix");
    expect(writes.join("")).toContain("[pfx] with prefix");
    logger.shutdown();
  });

  it("items can be added, updated and removed", () => {
    const { logger } = mkLogger();
    const sym = Symbol("s");
    logger.setItemType("none");
    logger.addItem({ name: "install", display: "Installing" });
    logger.addItem({ name: sym });
    expect(logger.hasItem("install")).toBe(true);
    expect(logger.hasItem(sym)).toBe(true);
    logger.updateItem("install", "resolving").updateItem("install", { msg: "linking", display: "Linking" });
    logger.removeItem("install");
    expect(logger.hasItem("install")).toBe(false);
    logger.removeItem(sym);
    expect(logger.hasItem(sym)).toBe(false);
    logger.shutdown();
  });

  it("color getter and setter", () => {
    const { logger } = mkLogger();
    expect(logger.color).toBe(false);
    logger.color = true;
    expect(logger.color).toBe(true);
    logger.shutdown();
  });
});
