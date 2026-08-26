import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import { BENCHMARK_METADATA } from "../constants/benchmarks";
import {
	assertBenchmarkMetadataParity,
	assertObservedCount,
	assertPublishedObservation,
} from "../harness/observe";
import { runningBenchPopulation } from "../run";
import {
	createInsertBlocksRunner,
	crdtBenchmarks,
} from "../suites/crdt.bench";
import { createInsertTextRunner } from "../suites/editor.bench";
import { createSchemaResolveRunner } from "../suites/schema.bench";
import { createStreamingBatchFlushRunner } from "../suites/streaming.bench";
import { createReadDocumentSummaryRunner } from "../suites/ai.bench";
import { createKeystrokeRunner, scale3Benchmarks } from "../suites/scale3.bench";
import {
	SCALE3_DOCUMENT_SIZE_POINTS,
	SCALE3_REMOTE_CARET_COUNT_POINTS,
} from "../constants/scale3";
import { SCALE3_SHARED_POINT } from "../fixtures/scale3Stack";

describe("post-clock observation", () => {
	it("assertObservedCount fails by name when the count is a no-op", () => {
		expect(() => assertObservedCount("insertedBlockCount", 0, 1000)).toThrow(
			/insertedBlockCount 0 !== 1000/,
		);
	});

	it("assertObservedCount refuses an expected count a no-op can satisfy", () => {
		expect(() => assertObservedCount("displayCount", 0, 0)).toThrow(
			/displayCount expected 0 is not a count a no-op cannot satisfy/,
		);
	});

	it("assertPublishedObservation fails when observe was never called", () => {
		expect(() =>
			assertPublishedObservation("crdt.insert-1000-blocks", null, false),
		).toThrow(/post-clock observation missing for crdt.insert-1000-blocks/);
	});

	it("runSuite refuses a duration bench that never observed", async () => {
		await expect(
			runSuite("missing-observation", [
				{
					id: "ghost.no-observe",
					name: "ghost no observe",
					fn(b) {
						b.start();
						b.end();
					},
				},
			]),
		).rejects.toThrow(/post-clock observation missing for ghost.no-observe/);
	});

	it("a skipped insert-1000 refuses to publish", async () => {
		const runner = createInsertBlocksRunner({ skip: true });
		await expect(
			bench("crdt.insert-1000-blocks no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/insertedBlockCount 0 !== 1000/);
	});

	it("a skipped editor insert-text refuses to publish", async () => {
		const runner = createInsertTextRunner({ skip: true });
		await expect(
			bench("editor.apply-insert-text-x1000 no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/insertedCharCount 0 !== 1000/);
	});

	it("a skipped schema resolve refuses to publish", async () => {
		const runner = createSchemaResolveRunner({ skip: true });
		await expect(
			bench("schema.resolve-x10000 no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/resolveCount 0 !== 10000/);
	});

	it("a skipped streaming batch-flush refuses to publish", async () => {
		const runner = createStreamingBatchFlushRunner({ skip: true });
		await expect(
			bench("streaming.batch-flush-latency no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/applyCount 0 !== 1/);
	});

	it("a skipped AI read_document refuses to publish", async () => {
		const runner = createReadDocumentSummaryRunner({ skip: true });
		await expect(
			bench("ai.read-document-summary-200-blocks no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/blockCount 0 !== 200/);
	});

	it("a skipped SCALE3 keystroke refuses to publish", async () => {
		const runner = createKeystrokeRunner({
			blockCount: SCALE3_DOCUMENT_SIZE_POINTS[0],
			axis: "document-size",
			axisPoint: SCALE3_DOCUMENT_SIZE_POINTS[0],
			skip: true,
		});
		await expect(
			bench("scale3 keystroke no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/insertedCharCount 0 !== 1/);
		await runner.teardown?.();
	});

	it("a skipped SCALE3 remote-caret keystroke refuses to publish", async () => {
		const runner = createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			remoteCaretCount: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
			skip: true,
			axis: "remote-caret-count",
			axisPoint: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
		});
		await expect(
			bench("scale3 remote-caret keystroke no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/insertedCharCount 0 !== 1/);
		await runner.teardown?.();
	});

	it("omitted SCALE3 remote carets refuse to publish the caret axis", async () => {
		const runner = createKeystrokeRunner({
			blockCount: SCALE3_SHARED_POINT.blockCount,
			remoteCaretCount: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
			skipRemoteCarets: true,
			axis: "remote-caret-count",
			axisPoint: SCALE3_REMOTE_CARET_COUNT_POINTS[1],
		});
		await expect(
			bench("scale3 remote-caret no-op", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(/remoteCaretCount 0 !== 8/);
		await runner.teardown?.();
	});

	it("the live SCALE3 remote-caret bench records the keystroke", async () => {
		const definition = scale3Benchmarks.find(
			(entry) =>
				entry.id === "scale3.keystroke.realistic-stack.remote-caret-count.8",
		);
		if (!definition) {
			throw new Error("scale3 remote-caret-count.8 missing");
		}
		const [result] = await runSuite("scale3-remote-caret", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.observation).toEqual({
			name: "insertedCharCount",
			actual: 1,
			expected: 1,
		});
		expect(result?.metrics?.remoteCaretCount).toBe(8);
	});

	it("the live insert-1000 bench records the named count", async () => {
		const definition = crdtBenchmarks.find(
			(entry) => entry.id === "crdt.insert-1000-blocks",
		);
		if (!definition) {
			throw new Error("crdt.insert-1000-blocks missing");
		}
		const [result] = await runSuite("crdt-insert", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.observation).toEqual({
			name: "insertedBlockCount",
			actual: 1000,
			expected: 1000,
		});
	});
});

describe("benchmark metadata population", () => {
	it("registered metadata matches the benches that actually run", () => {
		expect(() =>
			assertBenchmarkMetadataParity(BENCHMARK_METADATA, runningBenchPopulation()),
		).not.toThrow();
	});

	it("parity fails when a registered bench does not run", () => {
		expect(() =>
			assertBenchmarkMetadataParity(
				[
					...BENCHMARK_METADATA,
					{
						id: "ghost.registered-only",
						name: "registered but never started",
					},
				],
				runningBenchPopulation(),
			),
		).toThrow(/registered but not running: ghost.registered-only/);
	});

	it("parity fails when a running bench is not registered", () => {
		expect(() =>
			assertBenchmarkMetadataParity(BENCHMARK_METADATA, [
				...runningBenchPopulation(),
				{ id: "orphan.running-only", name: "running but unregistered" },
			]),
		).toThrow(/running but not registered: orphan.running-only/);
	});

	it("parity fails when a registered name does not match the running bench", () => {
		const running = runningBenchPopulation();
		const [first, ...rest] = running;
		expect(() =>
			assertBenchmarkMetadataParity(
				[{ id: first!.id, name: "wrong name" }, ...rest],
				running,
			),
		).toThrow(
			new RegExp(
				`benchmark metadata name mismatch for ${first!.id}`,
			),
		);
	});
});
