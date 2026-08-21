import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { BenchResult } from "../bench";
import {
	ENVELOPE_DRIFT_FLOOR_MS,
	ENVELOPE_DRIFT_RATIO,
	ENVELOPE_GATE_MIN_SIGNAL_MS,
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
	envelopePointIsGated,
} from "../constants/scale1";
import {
	buildEnvelopeRecord,
	compareEnvelopeDrift,
	formatEnvelopeDrift,
} from "../envelope/compare";
import { envelopeGateClass } from "../envelope/machine";
import {
	assertScale1AuditCoversMeasurements,
	SCALE1_FIXTURE_AUDIT,
} from "../fixtures/audit";
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
import {
	scale1Benchmarks,
	scale1FloorBenchmarks,
} from "../suites/scale1.bench";

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
		expect(
			SCALE1_MEASUREMENTS.map((entry) => entry.metadataRungId),
		).toEqual([
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
		expect(editor.getBlock(envelopeBlockId(99)).textContent()).toBe(
			"Block 99",
		);
		void editor.destroy();
	});

	it("SCALE1: 100k-character block loads", () => {
		const editor = createEnvelopeEditor("long-block");
		expect(
			editor.getBlock(ENVELOPE_LONG_BLOCK_ID).textContent().length,
		).toBe(SCALE1_LONG_BLOCK_CHARS);
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
		const blockId = envelopeBlockId(0);
		collab.editorA.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "PEER-A",
				},
			],
			{ origin: "user" },
		);
		collab.editorB.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "PEER-B",
				},
			],
			{ origin: "user" },
		);
		const fromA = collab.editorA.crdtDoc.adapter.encodeUpdate(
			collab.editorA.crdtDoc,
			Y.encodeStateVector(collab.editorB.ydoc),
		);
		const fromB = collab.editorB.crdtDoc.adapter.encodeUpdate(
			collab.editorB.crdtDoc,
			Y.encodeStateVector(collab.editorA.ydoc),
		);
		expect(fromA.byteLength).toBeGreaterThan(0);
		expect(fromB.byteLength).toBeGreaterThan(0);
		collab.sync();
		for (const editor of [collab.editorA, collab.editorB]) {
			const text = editor.getBlock(blockId).textContent();
			expect(text).toContain("PEER-A");
			expect(text).toContain("PEER-B");
		}
		void collab.editorA.destroy();
		void collab.editorB.destroy();
	});

	it("SCALE1: fixture audit covers every measurement and names the two historical misses", () => {
		expect(() => assertScale1AuditCoversMeasurements()).not.toThrow();
		expect(SCALE1_FIXTURE_AUDIT.map((row) => row.id)).toEqual(
			SCALE1_MEASUREMENTS.map((spec) => spec.id),
		);
		const peers = SCALE1_FIXTURE_AUDIT.find(
			(row) => row.id === "concurrentPeers-2",
		);
		expect(peers?.verdict).toBe("name-overstates");
		expect(peers?.actualSubject).toMatch(/Peer B does not write/);
		expect(peers?.floorKind).toBe("empty-sync");
	});

	it("SCALE1: floor benches pair 1:1 with the wall-clock benches", () => {
		expect(scale1FloorBenchmarks.map((bench) => bench.id)).toEqual(
			SCALE1_MEASUREMENTS.map(
				(spec) => `scale1.envelope.${spec.id}.floor`,
			),
		);
	});

	it("SCALE1: machine-class token ignores the ubuntu disclaimer on the macos label", () => {
		expect(envelopeGateClass(SCALE1_MACHINE_CLASS)).toBe("macos-arm64");
		expect(
			envelopeGateClass("linux-x64 (github-actions-ubuntu-latest)"),
		).toBe("linux");
	});

	it("SCALE1: CH8 gates the median of a stated sample, derived from measured variance", () => {
		expect(ENVELOPE_SAMPLE_SIZE).toBe(21);
		expect(ENVELOPE_DRIFT_RATIO).toBe(3);
		expect(ENVELOPE_DRIFT_FLOOR_MS).toBe(1);
		expect(ENVELOPE_GATE_MIN_SIGNAL_MS).toBe(0.5);
		expect(envelopePointIsGated(0.21)).toBe(false);
		expect(envelopePointIsGated(0.5)).toBe(true);
		expect(envelopeGateP50Ms(0.5)).toBe(1.5);
		expect(envelopeGateP50Ms(6.13)).toBe(18.39);
		expect(SCALE1_MACHINE_CLASS).toMatch(/macos-arm64/);
		expect(SCALE1_MACHINE_CLASS).toMatch(/Not the CI runner/);
	});

	it("SCALE1: attributed time is wall minus floor", () => {
		const record = recordWithP50(6.13, 0.13);
		const blocks5000 = record.points.find(
			(point) => point.id === "blocks-5000",
		);
		expect(blocks5000?.measuredP50Ms).toBe(6.13);
		expect(blocks5000?.floorP50Ms).toBe(0.13);
		expect(blocks5000?.attributedP50Ms).toBe(6);
		expect(blocks5000?.gated).toBe(true);
		expect(blocks5000?.gateP50Ms).toBe(18);
	});

	it("SCALE1: a row without a floor cannot be built", () => {
		const results = SCALE1_MEASUREMENTS.map((spec) =>
			resultFor(`scale1.envelope.${spec.id}`, 4),
		);
		expect(() =>
			buildEnvelopeRecord(results, {
				floorResults: [],
				producedOn: "2026-08-20",
			}),
		).toThrow(/harness floor missing/);
	});

	it("SCALE1: a median past the committed same-class gate fails drift", () => {
		const committed = recordWithP50(4);
		const gated = committed.points.find((point) => point.gated);
		expect(gated?.gateP50Ms).toBe(12);
		const fresh = recordWithP50((gated?.gateP50Ms ?? 0) + 0.01);
		const drift = compareEnvelopeDrift(fresh, committed);
		expect(drift.ok).toBe(false);
		expect(drift.skippedTiming).toBe(false);
		expect(formatEnvelopeDrift(drift)).toMatch(/blocks-100/);
	});

	it("SCALE1: a median at the committed same-class gate still passes", () => {
		const committed = recordWithP50(4);
		const gated = committed.points.find((point) => point.gated);
		const fresh = recordWithP50(gated?.gateP50Ms ?? 0);
		expect(compareEnvelopeDrift(fresh, committed).ok).toBe(true);
	});

	it("SCALE1: sub-signal rungs are recorded and not gated", () => {
		const committed = recordWithP50(0.21);
		expect(committed.points.every((point) => point.gated === false)).toBe(
			true,
		);
		const fresh = recordWithP50(8);
		const drift = compareEnvelopeDrift(fresh, committed);
		expect(drift.ok).toBe(true);
		expect(drift.skippedTiming).toBe(false);
	});

	it("SCALE1: cross-class timing is not compared", () => {
		const committed = recordWithP50(4);
		const fresh = recordWithP50(
			80,
			0,
			"linux-x64 (github-actions-ubuntu-latest)",
		);
		const drift = compareEnvelopeDrift(fresh, committed);
		expect(drift.ok).toBe(true);
		expect(drift.skippedTiming).toBe(true);
		expect(formatEnvelopeDrift(drift)).toMatch(/timing not compared/);
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

function resultFor(id: string, p50Ms: number): BenchResult {
	return {
		id,
		name: id,
		iterations: ENVELOPE_SAMPLE_SIZE,
		totalMs: p50Ms * ENVELOPE_SAMPLE_SIZE,
		averageMs: p50Ms,
		minMs: p50Ms,
		maxMs: p50Ms,
		p50Ms,
		p95Ms: p50Ms,
		opsPerSecond: p50Ms === 0 ? 0 : 1000 / p50Ms,
		isCritical: false,
	};
}

function recordWithP50(
	p50Ms: number,
	floorP50Ms = 0,
	machineClass = SCALE1_MACHINE_CLASS,
) {
	const results = SCALE1_MEASUREMENTS.map((spec) =>
		resultFor(`scale1.envelope.${spec.id}`, p50Ms),
	);
	const floorResults = SCALE1_MEASUREMENTS.map((spec) =>
		resultFor(`scale1.envelope.${spec.id}.floor`, floorP50Ms),
	);
	return buildEnvelopeRecord(results, {
		floorResults,
		producedOn: "2026-08-20",
		floorProducedOn: "2026-08-21",
		machineClass,
		status: "provisional",
		caveat: "test fixture",
	});
}
