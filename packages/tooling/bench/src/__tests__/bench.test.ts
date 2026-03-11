import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import type { BenchResult } from "../bench";
import { createLargeDocument } from "../fixtures/large-doc";
import { createBenchSuites, runAllSuites } from "../run";

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
    expect(result.p50Ms).toBeGreaterThanOrEqual(result.minMs);
    expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
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

  it("defines all wave 6 benchmark suites", () => {
    const suites = createBenchSuites();
    const suiteNames = suites.map((suite) => suite.name);

    expect(suiteNames).toEqual([
      "CRDT",
      "Schema",
      "Editor",
      "Streaming",
      "Extensions",
    ]);
    expect(suites.every((suite) => suite.benchmarks.length > 0)).toBe(true);
  });

  it("runs every real benchmark suite at least once", async () => {
    const allSuiteResults = await runAllSuites({
      iterations: 1,
      warmup: 0,
    });

    expect(allSuiteResults).toHaveLength(5);

    for (const suite of allSuiteResults) {
      expect(suite.results.length).toBeGreaterThan(0);

      for (const result of suite.results) {
        expect(Number.isFinite(result.averageMs)).toBe(true);
        expect(Number.isFinite(result.minMs)).toBe(true);
        expect(Number.isFinite(result.maxMs)).toBe(true);
        expect(Number.isFinite(result.p50Ms)).toBe(true);
        expect(Number.isFinite(result.p95Ms)).toBe(true);
        expect(Number.isFinite(result.opsPerSecond)).toBe(true);
      }
    }
  });
});

describe("@pen/bench fixtures", () => {
  // AC 18: createLargeDocument(500) produces valid 500-block document
  it("createLargeDocument produces a document with correct block count", () => {
    const { doc } = createLargeDocument(100);
    const penDoc = doc.penDocument;
    expect(penDoc.blockOrder.length).toBe(100);
  });

  it("createLargeDocument produces mixed block types", () => {
    const { doc } = createLargeDocument(20);
    const penDoc = doc.penDocument;
    const types = new Set<string>();
    for (let i = 0; i < penDoc.blockOrder.length; i++) {
      const id = penDoc.blockOrder.get(i);
      const blockMap = penDoc.blocks.get(id);
      if (blockMap) types.add(blockMap.get("type") as string);
    }
    expect(types.has("paragraph")).toBe(true);
    expect(types.has("heading")).toBe(true);
    expect(types.has("codeBlock")).toBe(true);
  });
});
