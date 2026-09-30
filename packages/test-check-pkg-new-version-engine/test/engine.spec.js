import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { asyncVerify } from "run-verify";
import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";

// the engine does nothing when ci-info detects a CI environment
const inCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.CONTINUOUS_INTEGRATION);

// simple caller supplied comparison; the engine only needs { isNewer, version }
const internalCheckIsNewer = (pkg, tags, tag = "latest") =>
  tags[tag] && tags[tag] !== pkg.version ? { isNewer: true, version: tags[tag] } : { isNewer: false };

it("exports the engine function", () => {
  expect(typeof checkPkgNewVersionEngine).toBe("function");
});

describe.skipIf(inCI)("checkPkgNewVersionEngine", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpnve-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const base = () => ({
    pkg: { name: "demo-pkg", version: "1.0.0" },
    saveMetaDir: dir,
    npmConfig: {},
    checkIsNewer: internalCheckIsNewer
  });

  it("notifies when fetchDistTags reports a newer version and saves meta", async () => {
    const notes = [];
    await asyncVerify(
      () =>
        checkPkgNewVersionEngine({
          ...base(),
          fetchDistTags: async () => ({ latest: "1.1.0" }),
          notifyNewVersion: d => notes.push(d)
        }),
      r => expect(r).toBe(true),
      () => expect(notes).toEqual([{ name: "demo-pkg", version: "1.0.0", newVersion: "1.1.0" }]),
      () => {
        const meta = JSON.parse(fs.readFileSync(path.join(dir, "check-pkg-new-version", "demo-pkg-latest-meta.json"), "utf-8"));
        expect(meta.distTags).toEqual({ latest: "1.1.0" });
        expect(meta.notifiedVersion).toBe("1.1.0");
      }
    );
  });

  it("does not refetch within checkInterval and does not renotify", async () => {
    let fetches = 0;
    const notes = [];
    const opts = () => ({
      ...base(),
      checkInterval: 60000,
      fetchDistTags: async () => {
        fetches++;
        return { latest: "1.1.0" };
      },
      notifyNewVersion: d => notes.push(d)
    });
    await checkPkgNewVersionEngine(opts());
    await checkPkgNewVersionEngine(opts());
    expect(fetches).toBe(1);
    expect(notes.length).toBe(1);
  });

  it("fetchJSON fallback reads dist-tags from packument url", async () => {
    const urls = [];
    const notes = [];
    await checkPkgNewVersionEngine({
      ...base(),
      pkg: { name: "@scope/demo", version: "1.0.0" },
      npmConfig: { registry: "https://reg.example.com/" },
      fetchJSON: async url => {
        urls.push(url);
        return { "dist-tags": { latest: "3.0.0" } };
      },
      notifyNewVersion: d => notes.push(d)
    });
    expect(urls[0]).toBe("https://reg.example.com/%40scope%2Fdemo");
    expect(notes[0].newVersion).toBe("3.0.0");
  });

  it("default notifier prints at process exit", () => {
    const script = `
      import { checkPkgNewVersionEngine } from "check-pkg-new-version-engine";
      await checkPkgNewVersionEngine({
        pkg: { name: "demo-pkg", version: "1.0.0" },
        saveMetaDir: ${JSON.stringify(dir)},
        npmConfig: {},
        checkIsNewer: () => ({ isNewer: true, version: "2.0.0" }),
        fetchDistTags: async () => ({ latest: "2.0.0" })
      });`;
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: process.cwd(),
      encoding: "utf-8",
      timeout: 30000
    });
    expect(r.stdout).toContain("demo-pkg");
    expect(r.stdout).toContain("1.0.0 -> 2.0.0");
  });

  it("no notify when up to date; missing fetch method resolves false", async () => {
    const notes = [];
    await checkPkgNewVersionEngine({
      ...base(),
      fetchDistTags: async () => ({ latest: "1.0.0" }),
      notifyNewVersion: d => notes.push(d)
    });
    expect(notes).toEqual([]);
    expect(await checkPkgNewVersionEngine({ ...base(), pkg: { name: "other-pkg", version: "1.0.0" } })).toBe(false);
  });
}, 30000);
