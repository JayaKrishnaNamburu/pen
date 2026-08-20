import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	evaluateBenchResult,
	getCriticalBenchFailures,
} from "../bench";
import type { BenchResult } from "../bench";
import {
	SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH,
	SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH,
	SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH,
	SCALE3_KEYSTROKE_PEER_COUNT_8_BENCH,
} from "../constants/benchmarks";
import {
	SCALE3_AXES,
	SCALE3_BASELINES,
	SCALE3_MACHINE_CLASS,
	SCALE3_PLUS_EXTENSIONS,
	SCALE3_SHIPPED_STACK,
	getScale3Baseline,
} from "../constants/scale3";
import { createScale3Editor, scale3KeystrokeTarget } from "../fixtures/scale3Stack";
import { loadBenchWaivers, resolvePackageWaiverFilePath } from "../run";
import { scale3Benchmarks } from "../suites/scale3.bench";

function slowedScale3Result(id: string, p50Ms: number): BenchResult {
	const baseline = getScale3Baseline(id);
	return {
		id,
		name: id,
		iterations: 50,
		totalMs: p50Ms * 50,
		averageMs: p50Ms,
		minMs: p50Ms,
		maxMs: p50Ms,
		p50Ms,
		p95Ms: p50Ms,
		opsPerSecond: 1000 / p50Ms,
		targetMs: baseline.gateP50Ms,
		isCritical: true,
	};
}

describe("SCALE3 realistic-stack keystroke", () => {
	it("SCALE3: names every bench and covers each declared axis at two points", () => {
		expect(scale3Benchmarks.every((bench) => bench.name.includes("SCALE3"))).toBe(
			true,
		);
		expect(SCALE3_AXES).toHaveLength(4);
		for (const spec of SCALE3_AXES) {
			expect(spec.points).toHaveLength(2);
			expect(spec.points[0]).not.toBe(spec.points[1]);
		}

		const ids = scale3Benchmarks.map((bench) => bench.id);
		expect(ids).toEqual(SCALE3_BASELINES.map((baseline) => baseline.id));
		expect(ids).toContain(SCALE3_KEYSTROKE_DOCUMENT_SIZE_100_BENCH.id);
		expect(ids).toContain(SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH.id);
		expect(ids).toContain(SCALE3_KEYSTROKE_EXTENSION_COUNT_PLUS8_BENCH.id);
		expect(ids).toContain(SCALE3_KEYSTROKE_DECORATION_COUNT_256_BENCH.id);
		expect(ids).toContain(SCALE3_KEYSTROKE_PEER_COUNT_8_BENCH.id);
	});

	it("SCALE3: documents the shipped stack as default preset plus no-op extras", () => {
		expect(SCALE3_SHIPPED_STACK).toEqual([
			"document-ops",
			"delta-stream",
			"undo",
			"rich-text-shortcuts",
			...SCALE3_PLUS_EXTENSIONS,
		]);
		expect(SCALE3_PLUS_EXTENSIONS).toEqual([
			"ai",
			"ai-suggestions",
			"ai-autocomplete",
			"search",
			"multiplayer",
		]);
	});

	it("SCALE3: JSON baselines stay aligned with the committed constants", async () => {
		const baselineFile = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../baselines/scale3.json",
		);
		const document = JSON.parse(await readFile(baselineFile, "utf8")) as {
			machineClass: string;
			baselines: Array<{
				id: string;
				measuredP50Ms: number;
				gateP50Ms: number;
			}>;
		};

		expect(document.machineClass).toBe(SCALE3_MACHINE_CLASS);
		expect(document.baselines.map((entry) => entry.id)).toEqual(
			SCALE3_BASELINES.map((entry) => entry.id),
		);
		for (const baseline of SCALE3_BASELINES) {
			const json = document.baselines.find((entry) => entry.id === baseline.id);
			expect(json?.measuredP50Ms).toBe(baseline.measuredP50Ms);
			expect(json?.gateP50Ms).toBe(baseline.gateP50Ms);
		}
	});

	it("SCALE3: commits a baseline per bench with a machine-class note", () => {
		expect(SCALE3_MACHINE_CLASS).toMatch(/macos-arm64/);
		expect(SCALE3_MACHINE_CLASS).toMatch(/github-actions-ubuntu-latest/);

		for (const bench of scale3Benchmarks) {
			const baseline = getScale3Baseline(bench.id ?? "");
			expect(baseline.gateP50Ms).toBeGreaterThanOrEqual(baseline.measuredP50Ms);
			expect(baseline.machineClass).toBe(SCALE3_MACHINE_CLASS);
			expect(bench.targetMs).toBe(baseline.gateP50Ms);
			expect(bench.critical).toBe(true);
		}
	});

	it("SCALE3: applies one user keystroke on the envelope-sized stack", () => {
		const editor = createScale3Editor({ blockCount: 100 });
		const blockId = scale3KeystrokeTarget(100);
		const before = editor.getBlock(blockId).textContent().length;

		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "x" }],
			{ origin: "user" },
		);

		expect(editor.getBlock(blockId).textContent().length).toBe(before + 1);
		expect(editor.document.blockOrder.length).toBe(100);
	});

	it("SCALE3: a deliberately slowed keystroke fails the committed baseline comparison", () => {
		const id = "scale3.keystroke.realistic-stack.document-size.1000";
		expect(SCALE3_KEYSTROKE_DOCUMENT_SIZE_1000_BENCH.id).toBe(id);
		const baseline = getScale3Baseline(id);
		const slowed = slowedScale3Result(id, baseline.gateP50Ms + 1);

		expect(evaluateBenchResult(slowed).meetsTarget).toBe(false);
		expect(getCriticalBenchFailures([slowed])).toEqual([slowed]);
	});

	it("SCALE3: a median at the committed gate still passes", () => {
		const id = "scale3.keystroke.realistic-stack.document-size.1000";
		const baseline = getScale3Baseline(id);
		const atGate = slowedScale3Result(id, baseline.gateP50Ms);

		expect(evaluateBenchResult(atGate).meetsTarget).toBe(true);
		expect(getCriticalBenchFailures([atGate])).toEqual([]);
	});

	it("SCALE3: waiver file is committed in the bench package", async () => {
		const waiverFile = await resolvePackageWaiverFilePath();
		expect(waiverFile).toBeDefined();

		const expected = resolve(
			dirname(fileURLToPath(import.meta.url)),
			"../../spec/benchWaivers.json",
		);
		await access(expected);
		expect(waiverFile).toBe(expected);
		await expect(loadBenchWaivers(expected)).resolves.toEqual([]);
	});
});
