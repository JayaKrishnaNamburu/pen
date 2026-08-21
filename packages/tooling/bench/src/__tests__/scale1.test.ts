import { describe, expect, it } from "vitest";
import type { BenchResult } from "../bench";
import {
	ENVELOPE_DRIFT_FLOOR_MS,
	ENVELOPE_DRIFT_RATIO,
	ENVELOPE_SAMPLE_SIZE,
	SCALE1_BLOCK_COUNTS,
	SCALE1_LONG_BLOCK_CHARS,
	SCALE1_MACHINE_CLASS,
	SCALE1_MEASUREMENTS,
	SCALE1_NESTING_DEPTH,
	SCALE1_PEER_COUNT,
	SCALE1_TABLE_COLS,
	SCALE1_TABLE_ROWS,
	envelopeGateP50Ms,
} from "../constants/scale1";
import {
	buildEnvelopeRecord,
	compareEnvelopeDrift,
	formatEnvelopeDrift,
} from "../envelope/compare";
import {
	ENVELOPE_LONG_BLOCK_ID,
	ENVELOPE_TABLE_BLOCK_ID,
	createEnvelopeCollaboration,
	createEnvelopeEditor,
	envelopeBlockId,
	envelopeNestId,
	generateBlockSpecs,
	measureNestingDepth,
} from "../fixtures/envelope";
import { parseBenchCLIArgs } from "../run";
import { scale1Benchmarks } from "../suites/scale1.bench";

describe("SCALE1 envelope ladder", () => {
	it("SCALE1: uses the published metadata axis ids and rung sizes", () => {
		expect(SCALE1_MEASUREMENTS.map((entry) => entry.axis)).toEqual([
			"blockCount",
			"blockCount",
			"blockCount",
			"longestBlock",
			"nestingDepth",
			"table",
			"concurrentPeers",
		]);
		expect(SCALE1_BLOCK_COUNTS).toEqual([100, 1000, 5000]);
		expect(SCALE1_LONG_BLOCK_CHARS).toBe(100_000);
		expect(SCALE1_NESTING_DEPTH).toBe(10);
		expect(SCALE1_TABLE_ROWS).toBe(50);
		expect(SCALE1_TABLE_COLS).toBe(20);
		expect(SCALE1_PEER_COUNT).toBe(2);
		expect(SCALE1_MEASUREMENTS.map((entry) => entry.metadataRungId)).toEqual([
			"blocks-100",
			"blocks-1000",
			"blocks-5000",
			"long-block",
			"nesting-10",
			"table-50x20",
			null,
		]);
	});

	it("SCALE1: names every bench after its metadata rung or axis point", () => {
		expect(scale1Benchmarks.map((bench) => bench.id)).toEqual(
			SCALE1_MEASUREMENTS.map((spec) => `scale1.envelope.${spec.id}`),
		);
		expect(
			scale1Benchmarks.every((bench) => bench.name.includes("SCALE1")),
		).toBe(true);
	});

	it("SCALE1: 100-block rung matches the published generator ids", () => {
		expect(generateBlockSpecs(100)).toHaveLength(100);
		expect(generateBlockSpecs(100)[0]).toEqual({
			id: "envelope-block-0",
			type: "heading",
			content: "Block 0",
			props: { level: 1 },
		});
		const editor = createEnvelopeEditor("blocks-100");
		expect(editor.document.blockOrder.length).toBe(100);
		expect(editor.getBlock(envelopeBlockId(99)).textContent()).toBe("Block 99");
		void editor.destroy();
	});

	it("SCALE1: 100k-character block loads", () => {
		const editor = createEnvelopeEditor("long-block");
		expect(editor.getBlock(ENVELOPE_LONG_BLOCK_ID).textContent().length).toBe(
			SCALE1_LONG_BLOCK_CHARS,
		);
		void editor.destroy();
	});

	it("SCALE1: nesting depth 10 loads", () => {
		const editor = createEnvelopeEditor("nesting-10");
		expect(measureNestingDepth(editor, envelopeNestId(0))).toBe(
			SCALE1_NESTING_DEPTH,
		);
		void editor.destroy();
	});

	it("SCALE1: 50x20 table loads", () => {
		const editor = createEnvelopeEditor("table-50x20");
		const table = editor.getBlock(ENVELOPE_TABLE_BLOCK_ID).as("table");
		expect(table?.tableRowCount()).toBe(SCALE1_TABLE_ROWS);
		expect(table?.tableColumnCount()).toBe(SCALE1_TABLE_COLS);
		void editor.destroy();
	});

	it("SCALE1: concurrentPeers uses the two-editor collaboration the table cites", () => {
		const collab = createEnvelopeCollaboration(100);
		expect(collab.editorA.document.blockOrder.length).toBe(100);
		expect(collab.editorB.document.blockOrder.length).toBe(100);
		collab.editorA.apply(
			[
				{
					type: "insert-text",
					blockId: envelopeBlockId(0),
					offset: 0,
					text: "x",
				},
			],
			{ origin: "user" },
		);
		collab.sync();
		expect(collab.editorB.getBlock(envelopeBlockId(0)).textContent()).toMatch(
			/^x/,
		);
		void collab.editorA.destroy();
		void collab.editorB.destroy();
	});

	it("SCALE1: CH8 gates the median of a stated sample, with an explicit CI-wide tolerance", () => {
		expect(ENVELOPE_SAMPLE_SIZE).toBe(21);
		expect(ENVELOPE_DRIFT_RATIO).toBe(4);
		expect(ENVELOPE_DRIFT_FLOOR_MS).toBe(15);
		expect(envelopeGateP50Ms(0.5)).toBe(15.5);
		expect(envelopeGateP50Ms(20)).toBe(80);
		expect(SCALE1_MACHINE_CLASS).toMatch(/macos-arm64/);
		expect(SCALE1_MACHINE_CLASS).toMatch(/Not the CI runner/);
	});

	it("SCALE1: a median past the committed gate fails drift", () => {
		const committed = recordWithP50(4);
		const fresh = recordWithP50(committed.points[0]!.gateP50Ms + 0.01);
		const drift = compareEnvelopeDrift(fresh, committed);
		expect(drift.ok).toBe(false);
		expect(formatEnvelopeDrift(drift)).toMatch(/blocks-100/);
	});

	it("SCALE1: a median at the committed gate still passes", () => {
		const committed = recordWithP50(4);
		const fresh = recordWithP50(committed.points[0]!.gateP50Ms);
		expect(compareEnvelopeDrift(fresh, committed).ok).toBe(true);
	});

	it("SCALE1: parseBenchCLIArgs accepts the envelope flags", () => {
		expect(parseBenchCLIArgs(["--envelope", "--json"])).toEqual({
			reporter: "json",
			envelope: true,
		});
		expect(parseBenchCLIArgs(["--write-envelope"])).toEqual({
			reporter: "console",
			envelope: true,
			writeEnvelope: true,
		});
	});
});

function recordWithP50(p50Ms: number) {
	const results: BenchResult[] = SCALE1_MEASUREMENTS.map((spec) => ({
		id: `scale1.envelope.${spec.id}`,
		name: spec.id,
		iterations: ENVELOPE_SAMPLE_SIZE,
		totalMs: p50Ms * ENVELOPE_SAMPLE_SIZE,
		averageMs: p50Ms,
		minMs: p50Ms,
		maxMs: p50Ms,
		p50Ms,
		p95Ms: p50Ms,
		opsPerSecond: 1000 / p50Ms,
		isCritical: false,
	}));
	return buildEnvelopeRecord(results, "2026-08-20");
}
