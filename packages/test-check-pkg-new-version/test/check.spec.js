import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { asyncVerify } from "run-verify";
import * as mod from "check-pkg-new-version";
import { checkPkgNewVersion, checkPkgNewVersionEngine } from "check-pkg-new-version";

// the check does nothing when ci-info detects a CI environment
const inCI = Boolean(process.env.CI || process.env.GITHUB_ACTIONS || process.env.CONTINUOUS_INTEGRATION);

describe("check-pkg-new-version exports", () => {
  it("exports checkPkgNewVersion and re-exports the engine", () => {
    expect(typeof checkPkgNewVersion).toBe("function");
    expect(typeof checkPkgNewVersionEngine).toBe("function");
    expect(typeof mod.default).toBe("undefined");
  });
});

describe.skipIf(inCI)("checkPkgNewVersion", () => {
  let dir;
  let server;
  let requests;
  let distTags;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cpnv-"));
    requests = [];
    distTags = { latest: "2.0.0" };
    server = http.createServer((req, res) => {
      requests.push({ url: req.url, ua: req.headers["user-agent"] });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ name: "demo-pkg", "dist-tags": distTags }));
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
  });

  afterEach(async () => {
    await new Promise(r => server.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const registry = () => `http://127.0.0.1:${server.address().port}/`;

  it("fetches dist-tags from a local registry and notifies", async () => {
    const notes = [];
    await asyncVerify(
      () =>
        checkPkgNewVersion({
          pkg: { name: "demo-pkg", version: "1.0.0" },
          saveMetaDir: dir,
          npmConfig: { registry: registry() },
          notifyNewVersion: d => notes.push(d)
        }),
      r => expect(r).toBe(true),
      () => expect(notes).toEqual([{ name: "demo-pkg", version: "1.0.0", newVersion: "2.0.0" }]),
      () => {
        expect(requests[0].url).toBe("/demo-pkg");
        expect(requests[0].ua).toContain("check-pkg-new-version");
      }
    );
  });

  it("does not notify when installed version is newer than latest", async () => {
    const notes = [];
    await checkPkgNewVersion({
      pkg: { name: "demo-pkg", version: "3.0.0" },
      saveMetaDir: dir,
      npmConfig: { registry: registry() },
      notifyNewVersion: d => notes.push(d)
    });
    expect(notes).toEqual([]);
  });

  it("honors checkTag", async () => {
    distTags = { latest: "1.0.0", next: "1.5.0" };
    const notes = [];
    await checkPkgNewVersion({
      pkg: { name: "demo-pkg", version: "1.0.0" },
      saveMetaDir: dir,
      checkTag: "next",
      npmConfig: { registry: registry() },
      notifyNewVersion: d => notes.push(d)
    });
    expect(notes[0].newVersion).toBe("1.5.0");
  });

  it("saves meta and skips refetch within checkInterval", async () => {
    const opts = () => ({
      pkg: { name: "demo-pkg", version: "1.0.0" },
      saveMetaDir: dir,
      checkInterval: 60000,
      npmConfig: { registry: registry() },
      notifyNewVersion: () => {}
    });
    await checkPkgNewVersion(opts());
    await checkPkgNewVersion(opts());
    expect(requests.length).toBe(1);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "check-pkg-new-version", "demo-pkg-latest-meta.json"), "utf-8"));
    expect(meta.distTags).toEqual({ latest: "2.0.0" });
  });

  it("network failure is swallowed and nothing is notified", async () => {
    const notes = [];
    const port = server.address().port;
    await new Promise(r => server.close(r));
    server = http.createServer().listen(0, "127.0.0.1");
    await new Promise(r => server.once("listening", r));
    await checkPkgNewVersion({
      pkg: { name: "demo-pkg", version: "1.0.0" },
      saveMetaDir: dir,
      npmConfig: { registry: `http://127.0.0.1:${port}/` },
      notifyNewVersion: d => notes.push(d)
    });
    expect(notes).toEqual([]);
  });
}, 30000);
