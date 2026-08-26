import { describe, expect, it } from "vitest";
import {
	STREAMING_BATCH_FLUSH_LATENCY_BENCH,
	STREAMING_GEN_DELTA_1000_PARTS_BENCH,
} from "../constants/benchmarks";
import { streamingBenchmarks } from "../suites/streaming.bench";

describe("streaming drift-report baseline", () => {
	it("streaming benches cannot publish without a Pen-removed floor", () => {
		const ids = streamingBenchmarks.map((bench) => bench.id);
		expect(ids).toEqual([
			STREAMING_GEN_DELTA_1000_PARTS_BENCH.id,
			STREAMING_BATCH_FLUSH_LATENCY_BENCH.id,
		]);
		expect(streamingBenchmarks.every((bench) => bench.floor)).toBe(true);
	});
});
