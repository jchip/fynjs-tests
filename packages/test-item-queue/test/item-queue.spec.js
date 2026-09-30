import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { verify } from "run-verify";
import { ItemQueue, Inflight } from "item-queue";

const sleep = ms => new Promise(r => setTimeout(r, ms));

describe("item-queue", { timeout: 20000 }, () => {
  it("exports ItemQueue and Inflight via ESM", () => {
    expect(typeof ItemQueue).toBe("function");
    expect(Inflight).toBeDefined();
    expect(typeof ItemQueue.pauseItem).toBe("symbol");
  });

  it("does not expose a CJS entry (ESM only package)", () => {
    const require = createRequire(import.meta.url);
    // node >= 22 can require() ESM; just make sure it either works or throws cleanly
    try {
      const m = require("item-queue");
      expect(typeof m.ItemQueue).toBe("function");
    } catch (err) {
      expect(err.code).toMatch(/ERR_REQUIRE_ESM|ERR_REQUIRE_ASYNC_MODULE/);
    }
  });

  it("processes all initial and added items", async () => {
    const seen = [];
    const q = new ItemQueue({
      processItem: async n => {
        await sleep(5);
        seen.push(n);
      },
      itemQ: [1, 2, 3],
      concurrency: 2
    });
    const waiting = q.start().wait();
    q.addItem(4);
    q.addItems([5, 6]);
    await verify({ timeout: 5000 })
      .step(() => waiting)
      .step(() => expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6]));
    expect(q.count).toBe(0);
    expect(q.isPending).toBe(false);
  });

  it("honors the concurrency limit", async () => {
    let active = 0;
    let max = 0;
    const q = new ItemQueue({
      processItem: async () => {
        active++;
        max = Math.max(max, active);
        await sleep(10);
        active--;
      },
      itemQ: Array.from({ length: 10 }, (_, i) => i),
      concurrency: 3
    });
    await q.start().wait();
    expect(max).toBe(3);
  });

  it("emits doneItem, empty and done events", async () => {
    const events = { doneItem: 0, empty: 0, done: null };
    const q = new ItemQueue({
      processItem: () => {},
      itemQ: ["a", "b"],
      concurrency: 1,
      handlers: {
        doneItem: () => events.doneItem++,
        empty: () => events.empty++,
        done: d => (events.done = d)
      }
    });
    await q.start().wait();
    expect(events.doneItem).toBe(2);
    expect(events.empty).toBeGreaterThanOrEqual(1);
    expect(events.done.totalTime).toBeGreaterThanOrEqual(0);
    expect(events.done.endTime).toBeGreaterThanOrEqual(events.done.startTime);
  });

  it("reports item failure and rejects wait with stopOnError", async () => {
    const failed = [];
    const q = new ItemQueue({
      processItem: async n => {
        if (n === 2) throw new Error("boom");
      },
      itemQ: [1, 2, 3],
      concurrency: 1,
      stopOnError: true,
      handlers: { failItem: d => failed.push(d.item) }
    });
    await verify({ timeout: 5000 })
      .expectErrorMatch("boom")
      .step(() => q.start().wait());
    expect(failed).toEqual([2]);
  });

  it("pauses at the pauseItem and resumes", async () => {
    const seen = [];
    let paused = 0;
    const q = new ItemQueue({
      processItem: n => {
        seen.push(n);
      },
      itemQ: [1, 2, ItemQueue.pauseItem, 3, 4],
      concurrency: 1,
      handlers: { pause: () => paused++ }
    });
    q.start();
    await sleep(100);
    expect(seen).toEqual([1, 2]);
    expect(q.isPause).toBe(true);
    expect(paused).toBe(1);
    const waiting = q.wait();
    q.resume();
    await waiting;
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it("emits watch events for slow items", async () => {
    const watches = [];
    const q = new ItemQueue({
      processItem: () => sleep(150),
      itemQ: ["slow"],
      concurrency: 1,
      watchPeriod: 20,
      watchTime: 50,
      handlers: { watch: d => watches.push(d) }
    });
    await q.start().wait();
    expect(watches.length).toBeGreaterThan(0);
    expect(watches.some(w => w.watched.some(x => x.item === "slow"))).toBe(true);
  });
});
