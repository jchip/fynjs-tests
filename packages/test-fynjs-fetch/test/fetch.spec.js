import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import Path from "node:path";
import { verify } from "run-verify";
import fynFetch, { createInstance, HttpError, TimeoutError, drain } from "@fynjs/fetch";

let server;
let base;
let flaky = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString();
      if (url.pathname === "/echo") {
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            method: req.method,
            query: Object.fromEntries(url.searchParams),
            headers: req.headers,
            body
          })
        );
      } else if (url.pathname === "/text") {
        res.end("hello text");
      } else if (url.pathname === "/404") {
        res.statusCode = 404;
        res.end("nope");
      } else if (url.pathname === "/flaky") {
        flaky++;
        if (flaky < 3) {
          res.statusCode = 503;
          res.end("later");
        } else res.end("ok after " + flaky);
      } else if (url.pathname === "/slow") {
        setTimeout(() => res.end("slow"), 2000);
      } else if (url.pathname === "/file") {
        res.end("x".repeat(10000));
      } else {
        res.statusCode = 500;
        res.end("?");
      }
    });
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise(r => server.close(r)));

describe("@fynjs/fetch", { timeout: 20000 }, () => {
  it("exports the public API", () => {
    expect(typeof fynFetch).toBe("function");
    expect(typeof fynFetch.json).toBe("function");
    expect(typeof createInstance).toBe("function");
    expect(typeof HttpError).toBe("function");
    expect(typeof TimeoutError).toBe("function");
    expect(typeof drain).toBe("function");
  });

  it("gets text and json", async () => {
    expect(await fynFetch.text(`${base}/text`)).toBe("hello text");
    const j = await fynFetch.json(`${base}/echo`);
    expect(j.method).toBe("GET");
  });

  it("sends json body and searchParams", async () => {
    const j = await fynFetch.json(`${base}/echo`, {
      method: "POST",
      json: { a: 1 },
      searchParams: { q: "z", n: 2 }
    });
    expect(j.method).toBe("POST");
    expect(JSON.parse(j.body)).toEqual({ a: 1 });
    expect(j.query).toEqual({ q: "z", n: "2" });
    expect(j.headers["content-type"]).toContain("application/json");
  });

  it("supports prefixUrl and instance defaults via create", async () => {
    const inst = fynFetch.create({ prefixUrl: base, headers: { "x-test": "yes" } });
    const j = await inst.json("echo");
    expect(j.headers["x-test"]).toBe("yes");
    const inst2 = inst.extend({ searchParams: { k: "v" } });
    expect((await inst2.json("echo")).query).toEqual({ k: "v" });
  });

  it("throws HttpError for json() on non-ok and not for raw get", async () => {
    const res = await fynFetch.get(`${base}/404`);
    expect(res.status).toBe(404);
    await drain(res);
    await verify({ timeout: 5000 })
      .expectError
      .step(() => fynFetch.json(`${base}/404`))
      .step(err => {
        expect(err).toBeInstanceOf(HttpError);
        expect(err.status).toBe(404);
      });
  });

  it("throwOnHttpError applies to plain requests", async () => {
    await expect(fynFetch(`${base}/404`, { throwOnHttpError: true })).rejects.toBeInstanceOf(HttpError);
  });

  it("retries on 503 for idempotent requests", async () => {
    flaky = 0;
    const t = await fynFetch.text(`${base}/flaky`, { retry: { retries: 3, minTimeout: 5, maxTimeout: 10 } });
    expect(t).toBe("ok after 3");
  });

  it("rejects negative retries with TypeError", async () => {
    await expect(fynFetch(`${base}/text`, { retry: { retries: -1 } })).rejects.toBeInstanceOf(TypeError);
  });

  it("times out with TimeoutError", async () => {
    await expect(fynFetch.text(`${base}/slow`, { timeout: 100 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("runs hooks and can short-circuit with beforeRequest", async () => {
    const res = await fynFetch(`${base}/echo`, {
      hooks: { beforeRequest: [() => new Response("cached")] }
    });
    expect(await res.text()).toBe("cached");
  });

  it("streams a response to a file", async () => {
    const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "fetch-"));
    const dest = Path.join(dir, "out.txt");
    await fynFetch.stream(`${base}/file`, dest);
    expect(fs.statSync(dest).size).toBe(10000);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
