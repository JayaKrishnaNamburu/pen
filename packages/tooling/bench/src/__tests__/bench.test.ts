import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
	bench,
	evaluateBenchResult,
	getCriticalBenchFailures,
	isBenchWaiverExpired,
	runSuite,
} from "../bench";
import type { BenchResult, BenchWaiver } from "../bench";
import { createLargeDocument } from "../fixtures/largeDoc";
import {
	DEFAULT_BENCH_WAIVER_FILE,
	assertCriticalBenchmarkTargets,
	createBenchSuites,
	loadBenchWaivers,
	parseBenchCLIArgs,
	resolveDefaultWaiverFilePath,
	runAllSuites,
} from "../run";

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
		expect(result.id).toBe("noop");
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

	it("captures benchmark metrics from the bench context", async () => {
		const result = await bench(
			"metrics",
			(b) => {
				b.start();
				b.end();
				b.setMetrics({
					preservedBlockCount: 3,
					insertedBlockCount: 1,
				});
			},
			{ iterations: 3, warmup: 0 },
		);

		expect(result.metrics).toEqual({
			preservedBlockCount: 3,
			insertedBlockCount: 1,
		});
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

	it("runSuite preserves benchmark metrics in results", async () => {
		const results = await runSuite(
			"metrics-suite",
			[
				{
					name: "with-metrics",
					fn: (b) => {
						b.start();
						b.end();
						b.setMetrics({ alignment: "substitute" });
					},
				},
			],
			{ iterations: 2, warmup: 0 },
		);

		expect(results[0]?.metrics).toEqual({ alignment: "substitute" });
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
			"AI",
		]);
		expect(suites.every((suite) => suite.benchmarks.length > 0)).toBe(true);
	});

	it("runs every real benchmark suite at least once", async () => {
		const allSuiteResults = await runAllSuites({
			iterations: 1,
			warmup: 0,
		});

		expect(allSuiteResults).toHaveLength(6);

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
	}, 10000);

	it("marks critical regressions from p95 latency", () => {
		const result: BenchResult = {
			id: "streaming.batch-flush-latency",
			name: "streaming batch flush latency",
			iterations: 5,
			totalMs: 90,
			averageMs: 18,
			minMs: 15,
			maxMs: 22,
			p50Ms: 18,
			p95Ms: 12,
			opsPerSecond: 55,
			targetMs: 10,
			isCritical: true,
		};

		expect(evaluateBenchResult(result)).toEqual({
			targetMs: 10,
			meetsTarget: false,
			isCritical: true,
			waiver: undefined,
			waiverExpired: false,
		});
		expect(getCriticalBenchFailures([result])).toEqual([result]);
	});

	it("throws when a critical target regresses", () => {
		const result: BenchResult = {
			id: "extension.dispatch-observe-x5",
			name: "extension dispatch",
			iterations: 5,
			totalMs: 15,
			averageMs: 3,
			minMs: 2,
			maxMs: 5,
			p50Ms: 3,
			p95Ms: 2,
			opsPerSecond: 333,
			targetMs: 1,
			isCritical: true,
		};

		expect(() => assertCriticalBenchmarkTargets([result])).toThrow(
			"Critical benchmark targets failed",
		);
	});

	it("allows explicit waivers for critical regressions", () => {
		const result: BenchResult = {
			id: "extension.dispatch-observe-x5",
			name: "extension dispatchObserve with 5 extensions",
			iterations: 5,
			totalMs: 15,
			averageMs: 3,
			minMs: 2,
			maxMs: 5,
			p50Ms: 3,
			p95Ms: 2,
			opsPerSecond: 333,
			targetMs: 1,
			isCritical: true,
		};
		const waiver: BenchWaiver = {
			benchId: "extension.dispatch-observe-x5",
			rationale: "Known regression under local instrumentation",
			owner: "wave-6",
			issue: "https://example.com/issues/bench-1",
			expiresOn: "2099-01-01",
		};

		expect(evaluateBenchResult(result, [waiver])).toEqual({
			targetMs: 1,
			meetsTarget: false,
			isCritical: true,
			waiver,
			waiverExpired: false,
		});
		expect(getCriticalBenchFailures([result], [waiver])).toEqual([]);
		expect(() => assertCriticalBenchmarkTargets([result], [waiver])).not.toThrow();
	});

	it("does not honor expired waivers", () => {
		const result: BenchResult = {
			id: "extension.dispatch-observe-x5",
			name: "extension dispatchObserve with 5 extensions",
			iterations: 5,
			totalMs: 15,
			averageMs: 3,
			minMs: 2,
			maxMs: 5,
			p50Ms: 3,
			p95Ms: 2,
			opsPerSecond: 333,
			targetMs: 1,
			isCritical: true,
		};
		const waiver: BenchWaiver = {
			benchId: "extension.dispatch-observe-x5",
			rationale: "Temporary exception",
			owner: "wave-6",
			expiresOn: "2000-01-01",
		};

		expect(isBenchWaiverExpired(waiver)).toBe(true);
		expect(evaluateBenchResult(result, [waiver])).toEqual({
			targetMs: 1,
			meetsTarget: false,
			isCritical: true,
			waiver,
			waiverExpired: true,
		});
		expect(getCriticalBenchFailures([result], [waiver])).toEqual([result]);
	});

	it("parses JSON reporter and waiver path from CLI args", () => {
		expect(
			parseBenchCLIArgs(["--json", "--waivers", "waivers.json"]),
		).toEqual({
			reporter: "json",
			waiverFile: "waivers.json",
		});

		expect(parseBenchCLIArgs(["--waivers=waivers.json"])).toEqual({
			reporter: "console",
			waiverFile: "waivers.json",
		});
	});

	it("rejects waiver files that do not match the schema document shape", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pen-bench-"));
		const waiverFile = join(dir, "waivers.json");
		await writeFile(
			waiverFile,
			JSON.stringify([
				{
					benchId: "extension.dispatch-observe-x5",
					rationale: "Expected on CI",
					owner: "release",
					issue: "BENCH-123",
					expiresOn: "2099-01-01",
				},
			]),
			"utf8",
		);

		await expect(loadBenchWaivers(waiverFile)).rejects.toThrow(
			"Benchmark waivers file must contain a { waivers: [] } document",
		);
	});

	it("loads waivers from a document file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pen-bench-"));
		const waiverFile = join(dir, "waivers.json");
		await writeFile(
			waiverFile,
			JSON.stringify({
				waivers: [
					{
						benchId: "extension.dispatch-observe-x5",
						rationale: "Expected on CI",
						owner: "release",
						issue: "https://example.com/issues/bench-2",
						expiresOn: "2099-01-01",
					},
				],
			}),
			"utf8",
		);

		await expect(loadBenchWaivers(waiverFile)).resolves.toEqual([
			{
				benchId: "extension.dispatch-observe-x5",
				rationale: "Expected on CI",
				owner: "release",
				issue: "https://example.com/issues/bench-2",
				expiresOn: "2099-01-01",
			},
		]);
	});

	it("resolves the conventional waiver file from parent directories", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pen-bench-"));
		const repoRoot = join(dir, "repo");
		const nestedDir = join(repoRoot, "packages", "tooling", "bench");
		const waiverFile = join(repoRoot, DEFAULT_BENCH_WAIVER_FILE);

		await mkdir(join(repoRoot, "spec"), { recursive: true });
		await mkdir(nestedDir, { recursive: true });
		await writeFile(
			waiverFile,
			JSON.stringify({ waivers: [] }),
			"utf8",
		);

		await expect(resolveDefaultWaiverFilePath(nestedDir)).resolves.toBe(
			waiverFile,
		);
	});

	it("loads the conventional waiver file when called without explicit waivers", async () => {
		const originalCwd = process.cwd();
		const dir = await mkdtemp(join(tmpdir(), "pen-bench-"));
		const repoRoot = join(dir, "repo");
		const nestedDir = join(repoRoot, "packages", "tooling", "bench");
		const waiverFile = join(repoRoot, DEFAULT_BENCH_WAIVER_FILE);

		await mkdir(join(repoRoot, "spec"), { recursive: true });
		await mkdir(nestedDir, { recursive: true });
		await writeFile(
			waiverFile,
			JSON.stringify({
				waivers: [
					{
						benchId: "extension.dispatch-observe-x5",
						rationale: "Expected on CI",
						owner: "release",
					},
				],
			}),
			"utf8",
		);

		try {
			process.chdir(nestedDir);
			await expect(loadBenchWaivers()).resolves.toEqual([
				{
					benchId: "extension.dispatch-observe-x5",
					rationale: "Expected on CI",
					owner: "release",
				},
			]);
		} finally {
			process.chdir(originalCwd);
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
