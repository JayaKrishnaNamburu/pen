import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import type { BenchResult } from "../bench";
import { createLargeDocument } from "../fixtures/large-doc";

describe("@pen/bench runner", () => {
  // AC 16: bench() returns BenchResult with averageMs, minMs, maxMs, opsPerSecond
  it("returns BenchResult with timing fields", async () => {
    const result = await bench(
      "noop",
      (b) => {
        b.start();
        b.end();
      },
      { iterations: 10, warmup: 2 },
    );

    expect(result.name).toBe("noop");
    expect(result.iterations).toBe(10);
    expect(result.averageMs).toBeGreaterThanOrEqual(0);
    expect(result.minMs).toBeGreaterThanOrEqual(0);
    expect(result.maxMs).toBeGreaterThanOrEqual(result.minMs);
    expect(result.opsPerSecond).toBeGreaterThan(0);
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });

  // AC 17: Warmup runs are excluded from measured results
  it("excludes warmup from measured iterations", async () => {
    let callCount = 0;
    const result = await bench(
      "count",
      (b) => {
        callCount++;
        b.start();
        b.end();
      },
      { iterations: 5, warmup: 3 },
    );

    expect(callCount).toBe(8); // 3 warmup + 5 measured
    expect(result.iterations).toBe(5);
  });

  // AC 15: runSuite runs benchmarks and produces results
  it("runSuite collects results from all benchmarks", async () => {
    const results = await runSuite(
      "test-suite",
      [
        { name: "fast", fn: (b) => { b.start(); b.end(); } },
        { name: "also-fast", fn: (b) => { b.start(); b.end(); } },
      ],
      { iterations: 5, warmup: 1 },
    );

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("fast");
    expect(results[1].name).toBe("also-fast");
  });
});

describe("@pen/bench fixtures", () => {
  // AC 18: createLargeDocument(500) produces valid 500-block document
  it("createLargeDocument produces a document with correct block count", () => {
    const { doc } = createLargeDocument(100);
    const penDoc = (doc as any).penDocument;
    expect(penDoc.blockOrder.length).toBe(100);
  });

  it("createLargeDocument produces mixed block types", () => {
    const { doc } = createLargeDocument(20);
    const penDoc = (doc as any).penDocument;
    const types = new Set<string>();
    for (let i = 0; i < penDoc.blockOrder.length; i++) {
      const id = penDoc.blockOrder.get(i);
      const blockMap = penDoc.blocks.get(id) as any;
      if (blockMap) types.add(blockMap.get("type") as string);
    }
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("heading")).toBe(true);
    expect(types.has("codeBlock")).toBe(true);
  });
});
