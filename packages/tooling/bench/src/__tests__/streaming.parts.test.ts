import { describe, expect, it } from "vitest";
import { bench, runSuite } from "../bench";
import { STREAMING_GEN_DELTA_1000_PARTS_BENCH } from "../constants/benchmarks";
import {
	assertGenDeltaPartsFeedClock,
	assertStreamingBlockReceivedDelta,
	countGenDeltaParts,
	generateGenDeltaParts,
} from "../fixtures/streamingParts";
import {
	STREAMING_GEN_DELTA_PARTS,
	createStreamingGenDeltaRunner,
	streamingBenchmarks,
} from "../suites/streaming.bench";

describe("generateGenDeltaParts clock feed", () => {
	it("produces the claimed gen-delta population", () => {
		const parts = generateGenDeltaParts(STREAMING_GEN_DELTA_PARTS, "block-0");
		expect(countGenDeltaParts(parts)).toBe(STREAMING_GEN_DELTA_PARTS);
		expect(parts[0]).toMatchObject({
			type: "gen-start",
			blockId: "block-0",
		});
		expect(parts[parts.length - 1]).toMatchObject({
			type: "gen-end",
			status: "complete",
		});
	});

	it("observation fails when the helper returns no gen-delta parts", () => {
		expect(() => assertGenDeltaPartsFeedClock([], STREAMING_GEN_DELTA_PARTS)).toThrow(
			/generateGenDeltaParts produced 0 gen-delta parts, expected 1000/,
		);
	});

	it("observation fails when the named block never received the last token", () => {
		expect(() =>
			assertStreamingBlockReceivedDelta("block-0", "hello", "token-999 "),
		).toThrow(
			/streaming bench block block-0 missing last gen-delta "token-999 "/,
		);
	});

	it("an empty helper refuses to publish the 1000-part bench", async () => {
		const runner = createStreamingGenDeltaRunner(() => []);
		await expect(
			bench("streaming.gen-delta-1000-parts empty", runner.fn, {
				iterations: 1,
				warmup: 0,
			}),
		).rejects.toThrow(
			/generateGenDeltaParts produced 0 gen-delta parts, expected 1000/,
		);
	});

	it("the live bench consumes generateGenDeltaParts and names the block", async () => {
		const definition = streamingBenchmarks.find(
			(entry) => entry.id === STREAMING_GEN_DELTA_1000_PARTS_BENCH.id,
		);
		if (!definition) {
			throw new Error("streaming.gen-delta-1000-parts missing");
		}
		const [result] = await runSuite("streaming-parts", [definition], {
			iterations: 1,
			warmup: 0,
		});
		expect(result?.metrics).toMatchObject({
			deltaCount: STREAMING_GEN_DELTA_PARTS,
			yieldCount: 100,
		});
		expect(typeof result?.metrics?.namedBlock).toBe("string");
		expect(typeof result?.floorP50Ms).toBe("number");
	});
});
