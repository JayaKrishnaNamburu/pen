import os from "node:os";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_CELL_COUNT,
	ANCHOR_ENCODE_COUNT,
	ANCHOR_WORD,
	ANCHOR_WORD_REPEAT,
	createBlockScaleFixture,
	createCellGridFixture,
	createCellScaleTextFixture,
	createScaleTextFixture,
	encodeSizes,
	measureCellInBlockEdit,
	measureSplitFollow,
	mintEncoded,
	resolveEncoded,
} from "../fixtures/anchors";
import {
	PG1_CLIENT_ID,
	PG1_ENCODE_MAX_BYTES,
	PG1_ENCODE_MIN_BYTES,
	PG1_ENCODE_P50_BYTES,
	PG1_ENCODE_P95_BYTES,
	PG1_MINT_P95_US,
	PG1_PHASE6_DELTA_P95_MS,
	PG1_REPAIR_P95_MS,
	PG1_RESOLVE_CACHED_P95_US,
	PG1_RESOLVE_COLD_P95_MS,
	PG1_SPEC,
	PG1_TEN_K_CELL_COUNT,
	PG1_TEN_K_CELL_WORD_COUNT,
	PG1_TEN_K_CONTENT_SHA256,
	PG1_TEN_K_FIXTURE_ID,
	PG1_TEN_K_GENERATOR,
	PG1_TEN_K_PARAGRAPH_COUNT,
	PG1_TEN_K_PARAGRAPH_SHA256,
	PG1_TEN_K_SEED,
	PG1_TEN_K_SEED_HEX,
	PG1_TEN_K_WORD_COUNT,
} from "./constants";
import type {
	Pg1AnchorBudgetRecord,
	Pg1Counts,
	Pg1Timings,
	Pg1VersusEntry,
} from "./types";

const TIMING_ITERS = 2_000;
const TIMING_FLOOR_ITERS = 2_000;

function loadavg1(): number {
	return os.loadavg()[0] ?? 0;
}

function cpuCount(): number {
	return os.cpus().length || 1;
}

function timingsAreMeasurable(load: number, cpus: number): boolean {
	return load < cpus / 2;
}

function usPerCall(work: (index: number) => void, iterations: number): number {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		work(i);
	}
	return ((performance.now() - start) * 1000) / iterations;
}

export function measurePg1Counts(): Pg1Counts {
	const paragraph = createScaleTextFixture();
	const paragraphSizes = encodeSizes(paragraph.encoded);
	const paragraphResolved = paragraph.encoded.map((encoded) =>
		resolveEncoded(paragraph.doc, encoded),
	);
	let paragraphNull = 0;
	for (let i = 0; i < paragraphResolved.length; i++) {
		const point = paragraphResolved[i]!;
		if (
			point.index !== paragraph.offsets[i] ||
			point.type !== paragraph.content
		) {
			paragraphNull += 1;
		}
	}

	const blocks = createBlockScaleFixture();
	const blockResolved = blocks.encoded.map((encoded) =>
		resolveEncoded(blocks.doc, encoded),
	);
	let blockNull = 0;
	for (const point of blockResolved) {
		if (point.index !== 0 || point.type == null) {
			blockNull += 1;
		}
	}

	const cellText = createCellScaleTextFixture();
	const cellSizes = encodeSizes(cellText.encoded);
	const cellResolved = cellText.encoded.map((encoded) =>
		resolveEncoded(cellText.doc, encoded),
	);
	let cellNull = 0;
	let cellWrongType = 0;
	for (let i = 0; i < cellResolved.length; i++) {
		const point = cellResolved[i]!;
		if (point.index !== cellText.offsets[i]) {
			cellNull += 1;
		}
		if (point.type !== cellText.content) {
			cellWrongType += 1;
		}
	}

	const cellGrid = createCellGridFixture();
	const gridResolved = cellGrid.encoded.map((encoded) =>
		resolveEncoded(cellGrid.doc, encoded),
	);
	let gridNull = 0;
	let gridWrongType = 0;
	for (let i = 0; i < gridResolved.length; i++) {
		const point = gridResolved[i]!;
		if (point.index !== 0) {
			gridNull += 1;
		}
		if (point.type !== cellGrid.cells[i]) {
			gridWrongType += 1;
		}
	}

	const split = measureSplitFollow();
	const cellEdit = measureCellInBlockEdit();

	return {
		encodeSize: paragraphSizes,
		encodeSizeCell: cellSizes,
		resolve70k: {
			resolveCount: paragraphResolved.length,
			nullCount: paragraphNull,
			charCount: paragraph.text.length,
		},
		resolve200Blocks: {
			resolveCount: blockResolved.length,
			nullCount: blockNull,
			blockCount: blocks.blockIds.length,
		},
		resolveCell70k: {
			resolveCount: cellResolved.length,
			nullCount: cellNull,
			charCount: cellText.text.length,
			wrongTypeCount: cellWrongType,
		},
		resolve200Cells: {
			resolveCount: gridResolved.length,
			nullCount: gridNull,
			cellCount: cellGrid.cells.length,
			wrongTypeCount: gridWrongType,
		},
		splitFollow: {
			stuckCount: split.stuckCount,
			followedCount: split.followedCount,
			v2MismatchCount: split.v2MismatchCount,
		},
		cellInBlockEdit: {
			insertOnCell: cellEdit.insert.onCell ? 1 : 0,
			deleteOnCell: cellEdit.delete.onCell ? 1 : 0,
			tableHasContent: cellEdit.tableHasContent ? 1 : 0,
		},
	};
}

export function measurePg1Timings(): Pg1Timings {
	const load = loadavg1();
	const cpus = cpuCount();
	const measurable = timingsAreMeasurable(load, cpus);
	const floorUs = usPerCall((i) => {
		void i;
	}, TIMING_FLOOR_ITERS);

	if (!measurable) {
		return {
			measurable: false,
			reason: `loadavg1 ${load.toFixed(2)} on ${cpus} CPUs; clocks are unmeasurable under this load (CH8)`,
			loadavg1: load,
			cpuCount: cpus,
			mintUsPerCall: null,
			resolveUsPerCall: null,
			resolve200UsPerCall: null,
			floorUsPerCall: floorUs,
		};
	}

	const paragraph = createScaleTextFixture();
	const mintUs = usPerCall((i) => {
		const offset = Math.floor((i / TIMING_ITERS) * paragraph.text.length);
		mintEncoded(paragraph.content, offset, 1);
	}, TIMING_ITERS);
	const resolveUs = usPerCall((i) => {
		resolveEncoded(
			paragraph.doc,
			paragraph.encoded[i % paragraph.encoded.length]!,
		);
	}, TIMING_ITERS);

	const blocks = createBlockScaleFixture();
	const resolve200Us = usPerCall((i) => {
		resolveEncoded(blocks.doc, blocks.encoded[i % blocks.encoded.length]!);
	}, TIMING_ITERS);

	return {
		measurable: true,
		reason: `loadavg1 ${load.toFixed(2)} on ${cpus} CPUs; attributed as raw Yjs clientID 0, not adapter.resolveRelativePosition`,
		loadavg1: load,
		cpuCount: cpus,
		mintUsPerCall: Math.max(0, mintUs - floorUs),
		resolveUsPerCall: Math.max(0, resolveUs - floorUs),
		resolve200UsPerCall: Math.max(0, resolve200Us - floorUs),
		floorUsPerCall: floorUs,
	};
}

function roundMeasured(value: number): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function versus(
	budget: number,
	measured: number,
	enforced: boolean,
	unit: Pg1VersusEntry["unit"],
): Pg1VersusEntry {
	return {
		budget,
		measured: roundMeasured(measured),
		blown: enforced ? measured !== budget : measured > budget,
		enforced,
		unit,
	};
}

function versusUnmeasured(
	budget: number,
	unit: Pg1VersusEntry["unit"],
): Pg1VersusEntry {
	return {
		budget,
		measured: -1,
		blown: true,
		enforced: false,
		unit,
	};
}

export function buildVersusSpec(
	counts: Pg1Counts,
	timings: Pg1Timings,
): Record<string, Pg1VersusEntry> {
	const mintUs = timings.mintUsPerCall;
	const resolveUs = timings.resolveUsPerCall;
	const resolveColdMs =
		resolveUs == null
			? Number.POSITIVE_INFINITY
			: (resolveUs * ANCHOR_ENCODE_COUNT) / 1000;

	return {
		"anchors.encode-size-1000.encodeCount": versus(
			ANCHOR_ENCODE_COUNT,
			counts.encodeSize.count,
			true,
			"count",
		),
		"anchors.encode-size-1000.minBytes": versus(
			PG1_ENCODE_MIN_BYTES,
			counts.encodeSize.minBytes,
			true,
			"bytes",
		),
		"anchors.encode-size-1000.p50Bytes": versus(
			PG1_ENCODE_P50_BYTES,
			counts.encodeSize.p50Bytes,
			true,
			"bytes",
		),
		"anchors.encode-size-1000.p95Bytes": versus(
			PG1_ENCODE_P95_BYTES,
			counts.encodeSize.p95Bytes,
			true,
			"bytes",
		),
		"anchors.encode-size-1000.maxBytes": versus(
			PG1_ENCODE_MAX_BYTES,
			counts.encodeSize.maxBytes,
			true,
			"bytes",
		),
		"anchors.encode-size-cell-1000.encodeCount": versus(
			ANCHOR_ENCODE_COUNT,
			counts.encodeSizeCell.count,
			true,
			"count",
		),
		"anchors.encode-size-cell-1000.minBytes": versus(
			PG1_ENCODE_MIN_BYTES,
			counts.encodeSizeCell.minBytes,
			true,
			"bytes",
		),
		"anchors.encode-size-cell-1000.maxBytes": versus(
			PG1_ENCODE_MAX_BYTES,
			counts.encodeSizeCell.maxBytes,
			true,
			"bytes",
		),
		"anchors.resolve-70k-1000.resolveCount": versus(
			ANCHOR_ENCODE_COUNT,
			counts.resolve70k.resolveCount,
			true,
			"count",
		),
		"anchors.resolve-70k-1000.nullCount": versus(
			0,
			counts.resolve70k.nullCount,
			true,
			"count",
		),
		"anchors.resolve-200-blocks.resolveCount": versus(
			ANCHOR_BLOCK_COUNT,
			counts.resolve200Blocks.resolveCount,
			true,
			"count",
		),
		"anchors.resolve-200-blocks.nullCount": versus(
			0,
			counts.resolve200Blocks.nullCount,
			true,
			"count",
		),
		"anchors.resolve-cell-70k-1000.resolveCount": versus(
			ANCHOR_ENCODE_COUNT,
			counts.resolveCell70k.resolveCount,
			true,
			"count",
		),
		"anchors.resolve-cell-70k-1000.wrongTypeCount": versus(
			0,
			counts.resolveCell70k.wrongTypeCount,
			true,
			"count",
		),
		"anchors.resolve-200-cells.resolveCount": versus(
			ANCHOR_CELL_COUNT,
			counts.resolve200Cells.resolveCount,
			true,
			"count",
		),
		"anchors.resolve-200-cells.wrongTypeCount": versus(
			0,
			counts.resolve200Cells.wrongTypeCount,
			true,
			"count",
		),
		"anchors.split-follow.stuckCount": versus(
			2,
			counts.splitFollow.stuckCount,
			true,
			"count",
		),
		"anchors.cell-in-block-edit.insertOnCell": versus(
			1,
			counts.cellInBlockEdit.insertOnCell,
			true,
			"count",
		),
		"anchors.cell-in-block-edit.deleteOnCell": versus(
			1,
			counts.cellInBlockEdit.deleteOnCell,
			true,
			"count",
		),
		"anchors.cell-in-block-edit.tableHasContent": versus(
			0,
			counts.cellInBlockEdit.tableHasContent,
			true,
			"count",
		),
		"pg1.mintP95Us":
			mintUs == null
				? versusUnmeasured(PG1_MINT_P95_US, "us")
				: versus(PG1_MINT_P95_US, mintUs, false, "us"),
		"pg1.resolveColdP95Ms":
			resolveUs == null
				? versusUnmeasured(PG1_RESOLVE_COLD_P95_MS, "ms")
				: versus(PG1_RESOLVE_COLD_P95_MS, resolveColdMs, false, "ms"),
		"pg1.resolveCachedP95Us": versusUnmeasured(
			PG1_RESOLVE_CACHED_P95_US,
			"us",
		),
		"pg1.repairP95Ms": versusUnmeasured(PG1_REPAIR_P95_MS, "ms"),
		"pg1.phase6DeltaP95Ms": versusUnmeasured(PG1_PHASE6_DELTA_P95_MS, "ms"),
	};
}

export function buildPg1Record(
	counts: Pg1Counts,
	timings: Pg1Timings,
	recordedAt = new Date().toISOString(),
): Pg1AnchorBudgetRecord {
	const load = timings.loadavg1;
	const cpus = timings.cpuCount;
	return {
		schemaVersion: 1,
		ruleId: "PG1",
		spec: PG1_SPEC,
		recordedAt,
		caveat: "PG1 names Chromium and absolute µs/ms budgets. Those clocks are machine-dependent (CH8 / SCALE3) and are record-only here. The gate is counts: encode sizes for clientID 0, mint/resolve cardinalities, and the cell cohort. 4–6 byte encodings occur for clientID 0 ONLY. liveCount is a mint-ever counter, not a currently-held count.",
		fixture: {
			id: PG1_TEN_K_FIXTURE_ID,
			generator: PG1_TEN_K_GENERATOR,
			seed: PG1_TEN_K_SEED,
			seedHex: PG1_TEN_K_SEED_HEX,
			wordCount: PG1_TEN_K_WORD_COUNT,
			paragraphCount: PG1_TEN_K_PARAGRAPH_COUNT,
			cellCount: PG1_TEN_K_CELL_COUNT,
			cellWordCount: PG1_TEN_K_CELL_WORD_COUNT,
			paragraphSha256: PG1_TEN_K_PARAGRAPH_SHA256,
			contentSha256: PG1_TEN_K_CONTENT_SHA256,
			substrate: {
				word: ANCHOR_WORD,
				wordRepeat: ANCHOR_WORD_REPEAT,
				charCount: ANCHOR_WORD.length * ANCHOR_WORD_REPEAT,
				encodeCount: ANCHOR_ENCODE_COUNT,
				blockCount: ANCHOR_BLOCK_COUNT,
				cellCount: ANCHOR_CELL_COUNT,
				clientID: PG1_CLIENT_ID,
			},
		},
		environment: {
			producedOn: recordedAt.slice(0, 10),
			platform: os.platform(),
			arch: os.arch(),
			node: process.version,
			cpuCount: cpus,
			loadavg1: load,
			loadTaken: !timings.measurable,
			browser: "none",
			browserVersion: null,
			machineClass: `${os.platform()}-${os.arch()}`,
		},
		protocol: {
			wiring: "Substrate benches mint/resolve through raw Yjs (clientID 0), not adapter.createRelativePosition / resolveRelativePosition. Chromium scenario asserts the same counts on editor.anchors against the 10k fixture. Nothing is unwired — the harness is the consumer.",
			clientID: PG1_CLIENT_ID,
			clientIDNote:
				"4–6 byte encodings occur for clientID 0 ONLY. A live Y.Doc client id encodes larger (still under the 256-byte hostile-input cap).",
			liveCountNote:
				"Shipped liveCount is a monotonically increasing mint / deserialize / remint counter. It does not decrement when an Anchor is dropped.",
			clockPolicy:
				"versusSpec clocks have enforced: false. A slow number under load is unmeasurable, not a regression. Counts are the gate.",
		},
		counts,
		timings,
		versusSpec: buildVersusSpec(counts, timings),
	};
}

export function measurePg1Record(): Pg1AnchorBudgetRecord {
	return buildPg1Record(measurePg1Counts(), measurePg1Timings());
}
