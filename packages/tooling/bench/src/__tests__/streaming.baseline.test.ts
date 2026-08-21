import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	STREAMING_BATCH_FLUSH_LATENCY_BENCH,
	STREAMING_GEN_DELTA_1000_PARTS_BENCH,
} from "../constants/benchmarks";
import { streamingBenchmarks } from "../suites/streaming.bench";

const STREAMING_BASELINE_PATH = resolve(
	dirname(fileURLToPath(import.meta.url)),
	"../../baselines/streaming.json",
);

interface StreamingBaselinePoint {
	id: string;
	measuredP50Ms: number;
	p95Ms: number;
	targetMs: number;
	critical: boolean;
	meetsTarget: boolean;
	diagnosis: string;
}

interface StreamingBaseline {
	ruleId: string;
	spec: string;
	kind: string;
	isV1Baseline: boolean;
	comparisonTo: string;
	gateStatistic: string;
	sampleSize: number;
	producedOn: string;
	machineClass: string;
	points: StreamingBaselinePoint[];
	coalescedNoYield: {
		applyCount: number;
		measuredP50Ms: number;
	};
}

describe("streaming drift-report baseline", () => {
	it("records the 2.5 writer path with provenance and does not claim to be v1", async () => {
		const raw = await readFile(STREAMING_BASELINE_PATH, "utf8");
		const baseline = JSON.parse(raw) as StreamingBaseline;

		expect(baseline.ruleId).toBe("WAVE02-STREAMING");
		expect(baseline.spec).toBe("spec-v2/waves/wave-02-commit-pipeline.md");
		expect(baseline.kind).toBe("drift-report");
		expect(baseline.isV1Baseline).toBe(false);
		expect(baseline.comparisonTo).toMatch(/not one/i);
		expect(baseline.comparisonTo).not.toMatch(/±\s*10%/);
		expect(baseline.gateStatistic).toBe("median");
		expect(baseline.sampleSize).toBe(50);
		expect(baseline.producedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(baseline.machineClass.length).toBeGreaterThan(0);
		expect(baseline.coalescedNoYield.applyCount).toBe(1);

		const ids = baseline.points.map((point) => point.id);
		expect(ids).toEqual([
			STREAMING_GEN_DELTA_1000_PARTS_BENCH.id,
			STREAMING_BATCH_FLUSH_LATENCY_BENCH.id,
		]);

		const genDelta = baseline.points[0];
		const batchFlush = baseline.points[1];
		expect(genDelta?.targetMs).toBe(
			STREAMING_GEN_DELTA_1000_PARTS_BENCH.targetMs,
		);
		expect(genDelta?.critical).toBe(false);
		expect(genDelta?.meetsTarget).toBe(false);
		expect(genDelta?.diagnosis).toMatch(/setTimeout\(0\)/);
		expect(batchFlush?.critical).toBe(true);
		expect(batchFlush?.diagnosis).toMatch(/timedApplyCount is 0/);
	});

	it("streaming benches cannot publish without a Pen-removed floor", () => {
		const ids = streamingBenchmarks.map((bench) => bench.id);
		expect(ids).toEqual([
			STREAMING_GEN_DELTA_1000_PARTS_BENCH.id,
			STREAMING_BATCH_FLUSH_LATENCY_BENCH.id,
		]);
		expect(streamingBenchmarks.every((bench) => bench.floor)).toBe(true);
	});
});
