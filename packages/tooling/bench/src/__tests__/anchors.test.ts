import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { attributeBenchResult, runSuite } from "../bench";
import {
	ANCHORS_ENCODE_SIZE_1000_BENCH,
	ANCHORS_RESOLVE_200_BLOCKS_BENCH,
	ANCHORS_RESOLVE_70K_1000_BENCH,
	ANCHORS_SPLIT_FOLLOW_BENCH,
} from "../constants/benchmarks";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_CELL_COL,
	ANCHOR_CELL_COUNT,
	ANCHOR_CELL_ROW,
	ANCHOR_ENCODE_COUNT,
	ANCHOR_WORD,
	ANCHOR_WORD_REPEAT,
	CELL_COPY_SPLIT_ANALOG,
	CELL_DELETE_AT,
	CELL_EDIT_OFFSET,
	CELL_EDIT_TEXT,
	CELL_INSERT_TEXT,
	SPLIT_HEAD_TEXT,
	SPLIT_OFFSET,
	SPLIT_SOURCE_TEXT,
	SPLIT_TAIL_TEXT,
	createBlockScaleFixture,
	createCellGridFixture,
	createCellScaleTextFixture,
	createPenShapedDoc,
	createScaleTextFixture,
	encodeSizes,
	insertBlockText,
	measureCellInBlockEdit,
	measureSplitFollow,
	mintEncoded,
	resolveEncoded,
} from "../fixtures/anchors";
import {
	ANCHORS_CELL_IN_BLOCK_EDIT_BENCH,
	ANCHORS_ENCODE_SIZE_CELL_1000_BENCH,
	ANCHORS_RESOLVE_200_CELLS_BENCH,
	ANCHORS_RESOLVE_CELL_70K_1000_BENCH,
	anchorsBenchmarks,
} from "../suites/anchors.bench";

describe("Yjs relative-position substrate", () => {
	it("every anchors bench declares a Pen-removed floor", () => {
		expect(anchorsBenchmarks.length).toBe(8);
		expect(
			anchorsBenchmarks.every((entry) => typeof entry.floor === "function"),
		).toBe(true);
	});

	it("encode size is a 4–6 byte count, not a clock", () => {
		const fixture = createScaleTextFixture();
		expect(fixture.text).toBe(ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT));
		expect(fixture.text.length).toBe(70_000);
		expect(fixture.encoded).toHaveLength(ANCHOR_ENCODE_COUNT);
		const sizes = encodeSizes(fixture.encoded);
		expect(sizes.count).toBe(ANCHOR_ENCODE_COUNT);
		expect(sizes.minBytes).toBeGreaterThanOrEqual(4);
		expect(sizes.maxBytes).toBeLessThanOrEqual(6);
		expect(sizes.p50Bytes).toBeGreaterThanOrEqual(sizes.minBytes);
		expect(sizes.p95Bytes).toBeLessThanOrEqual(sizes.maxBytes);
	});

	it("a live random clientID encodes larger than the case-0 item id", () => {
		const { doc, blocks } = createPenShapedDoc(0x24d3a198);
		const content = insertBlockText(doc, blocks, "b1", ANCHOR_WORD.repeat(100));
		const encoded = mintEncoded(content, 50, 1);
		expect(encoded.byteLength).toBeGreaterThan(6);
	});

	it("encodeSizes refuses an empty population", () => {
		expect(() => encodeSizes([])).toThrow(/empty population/);
	});

	it("resolve at 70k chars returns the minted offsets", () => {
		const fixture = createScaleTextFixture();
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved).toHaveLength(ANCHOR_ENCODE_COUNT);
		for (let i = 0; i < resolved.length; i++) {
			expect(resolved[i]?.index).toBe(fixture.offsets[i]);
			expect(resolved[i]?.type).toBe(fixture.content);
		}
	});

	it("resolve across 200 blocks hits mint-at-0 on each type", () => {
		const fixture = createBlockScaleFixture();
		expect(fixture.blockIds).toHaveLength(ANCHOR_BLOCK_COUNT);
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved.every((point) => point.index === 0 && point.type != null)).toBe(
			true,
		);
	});

	it("Pen copy-split leaves tail and assoc-1 split point stuck on the source", () => {
		const measured = measureSplitFollow();
		expect(measured.sourceText).toBe(SPLIT_HEAD_TEXT);
		expect(measured.destText).toBe(SPLIT_TAIL_TEXT);
		expect(SPLIT_SOURCE_TEXT.slice(0, SPLIT_OFFSET)).toBe(SPLIT_HEAD_TEXT);
		expect(SPLIT_SOURCE_TEXT.slice(SPLIT_OFFSET)).toBe(SPLIT_TAIL_TEXT);

		const byName = Object.fromEntries(
			measured.results.map((result) => [result.name, result]),
		);
		expect(byName.head).toMatchObject({
			resolvedIndex: 3,
			onSource: true,
			matchesV2: true,
			stuckOnSource: false,
		});
		expect(byName["split-assoc-minus1"]).toMatchObject({
			resolvedIndex: SPLIT_OFFSET,
			onSource: true,
			matchesV2: true,
			stuckOnSource: false,
		});
		expect(byName["split-assoc-plus1"]).toMatchObject({
			onSource: true,
			onDest: false,
			matchesV2: false,
			stuckOnSource: true,
		});
		expect(byName.tail).toMatchObject({
			resolvedIndex: SPLIT_OFFSET,
			onSource: true,
			onDest: false,
			matchesV2: false,
			stuckOnSource: true,
		});
		expect(measured.stuckCount).toBe(2);
		expect(measured.followedCount).toBe(2);
		expect(measured.v2MismatchCount).toBe(2);
	});

	it("timed benches attribute a floor and keep the post-clock counts", async () => {
		const [result] = await runSuite(
			"anchors-floor",
			anchorsBenchmarks.filter(
				(entry) => entry.id === ANCHORS_SPLIT_FOLLOW_BENCH.id,
			),
			{ iterations: 1, warmup: 0 },
		);
		expect(typeof result?.floorP50Ms).toBe("number");
		expect(typeof result?.attributedP50Ms).toBe("number");
		expect(result?.attributedP50Ms).toBe(attributeBenchResult(result!));
		expect(result?.metrics).toMatchObject({
			stuckCount: 2,
			followedCount: 2,
			v2MismatchCount: 2,
			sourceChars: SPLIT_HEAD_TEXT.length,
			destChars: SPLIT_TAIL_TEXT.length,
		});
	});

	it("encode and resolve benches record counts after the clock", async () => {
		const results = await runSuite(
			"anchors-counts",
			anchorsBenchmarks.filter((entry) =>
				[
					ANCHORS_ENCODE_SIZE_1000_BENCH.id,
					ANCHORS_RESOLVE_70K_1000_BENCH.id,
					ANCHORS_RESOLVE_200_BLOCKS_BENCH.id,
				].includes(entry.id ?? ""),
			),
			{ iterations: 1, warmup: 0 },
		);
		const byId = Object.fromEntries(
			results.map((result) => [result.id, result]),
		);
		expect(byId["anchors.encode-size-1000"]?.metrics).toMatchObject({
			encodeCount: ANCHOR_ENCODE_COUNT,
			charCount: 70_000,
		});
		expect(byId["anchors.resolve-70k-1000"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_ENCODE_COUNT,
			nullCount: 0,
		});
		expect(byId["anchors.resolve-200-blocks"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_BLOCK_COUNT,
			blockCount: ANCHOR_BLOCK_COUNT,
		});
		for (const result of results) {
			expect(typeof result.floorP50Ms).toBe("number");
			expect(typeof result.attributedP50Ms).toBe("number");
		}
	});
});

describe("Yjs relative-position table-cell cohort", () => {
	it("a table block stores cell text on nested Y.Text, not block.content", () => {
		const fixture = createCellScaleTextFixture();
		expect(fixture.block.get("type")).toBe("table");
		expect(fixture.block.get("content")).toBeUndefined();
		expect(fixture.content).toBeInstanceOf(Y.Text);
		expect(fixture.content.toString()).toBe(fixture.text);
		expect(fixture.cell).toEqual({
			row: ANCHOR_CELL_ROW,
			col: ANCHOR_CELL_COL,
		});
	});

	it("encode size in a table cell is a 4–6 byte count, not a clock", () => {
		const fixture = createCellScaleTextFixture();
		expect(fixture.text).toBe(ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT));
		expect(fixture.text.length).toBe(70_000);
		expect(fixture.encoded).toHaveLength(ANCHOR_ENCODE_COUNT);
		const sizes = encodeSizes(fixture.encoded);
		expect(sizes.count).toBe(ANCHOR_ENCODE_COUNT);
		expect(sizes.minBytes).toBeGreaterThanOrEqual(4);
		expect(sizes.maxBytes).toBeLessThanOrEqual(6);
	});

	it("resolve at 70k cell chars returns the minted offsets on the cell Y.Text", () => {
		const fixture = createCellScaleTextFixture();
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved).toHaveLength(ANCHOR_ENCODE_COUNT);
		for (let i = 0; i < resolved.length; i++) {
			expect(resolved[i]?.index).toBe(fixture.offsets[i]);
			expect(
				resolved[i]?.type,
				"cell-resolve-stays-on-cell-ytext",
			).toBe(fixture.content);
			expect(resolved[i]?.type).not.toBe(fixture.block.get("content"));
		}
	});

	it("resolve across 200 cells hits mint-at-0 on each cell Y.Text", () => {
		const fixture = createCellGridFixture();
		expect(fixture.cells).toHaveLength(ANCHOR_CELL_COUNT);
		expect(fixture.block.get("content")).toBeUndefined();
		const resolved = fixture.encoded.map((encoded) =>
			resolveEncoded(fixture.doc, encoded),
		);
		expect(resolved).toHaveLength(ANCHOR_CELL_COUNT);
		for (let i = 0; i < resolved.length; i++) {
			expect(resolved[i]?.index, `cell ${i} index`).toBe(0);
			expect(
				resolved[i]?.type,
				`cell-grid-stays-on-cell-ytext-${i}`,
			).toBe(fixture.cells[i]);
		}
		const uniqueTypes = new Set(resolved.map((point) => point.type));
		expect(uniqueTypes.size).toBe(ANCHOR_CELL_COUNT);
	});

	it("in-cell insert shifts the mint and in-cell delete collapses it, both on the cell", () => {
		const measured = measureCellInBlockEdit();
		expect(measured.tableHasContent).toBe(false);
		expect(measured.insert.text).toBe(`${CELL_INSERT_TEXT}${CELL_EDIT_TEXT}`);
		expect(measured.insert.resolvedIndex).toBe(
			CELL_EDIT_OFFSET + CELL_INSERT_TEXT.length,
		);
		expect(measured.insert.onCell).toBe(true);
		expect(measured.insert.onWrongType).toBe(false);
		expect(measured.delete.text).toBe("012789");
		expect(measured.delete.resolvedIndex).toBe(CELL_DELETE_AT);
		expect(measured.delete.onCell).toBe(true);
		expect(measured.delete.onWrongType).toBe(false);
	});

	it("a table cell has no Pen copy-split analog", () => {
		expect(CELL_COPY_SPLIT_ANALOG).toBeNull();
	});

	it("cell benches attribute a floor and keep the post-clock counts", async () => {
		const results = await runSuite(
			"anchors-cell-counts",
			anchorsBenchmarks.filter((entry) =>
				[
					ANCHORS_ENCODE_SIZE_CELL_1000_BENCH.id,
					ANCHORS_RESOLVE_CELL_70K_1000_BENCH.id,
					ANCHORS_RESOLVE_200_CELLS_BENCH.id,
					ANCHORS_CELL_IN_BLOCK_EDIT_BENCH.id,
				].includes(entry.id ?? ""),
			),
			{ iterations: 1, warmup: 0 },
		);
		const byId = Object.fromEntries(
			results.map((result) => [result.id, result]),
		);
		expect(byId["anchors.encode-size-cell-1000"]?.metrics).toMatchObject({
			encodeCount: ANCHOR_ENCODE_COUNT,
			charCount: 70_000,
			resolvedOnCell: 1,
			tableHasContent: 0,
		});
		expect(byId["anchors.resolve-cell-70k-1000"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_ENCODE_COUNT,
			nullCount: 0,
			wrongTypeCount: 0,
			tableHasContent: 0,
		});
		expect(byId["anchors.resolve-200-cells"]?.metrics).toMatchObject({
			resolveCount: ANCHOR_CELL_COUNT,
			cellCount: ANCHOR_CELL_COUNT,
			wrongTypeCount: 0,
			tableHasContent: 0,
		});
		expect(byId["anchors.cell-in-block-edit"]?.metrics).toMatchObject({
			insertShifted: CELL_EDIT_OFFSET + CELL_INSERT_TEXT.length,
			insertExpected: CELL_EDIT_OFFSET + CELL_INSERT_TEXT.length,
			insertOnCell: 1,
			deleteCollapsed: CELL_DELETE_AT,
			deleteExpected: CELL_DELETE_AT,
			deleteOnCell: 1,
			tableHasContent: 0,
		});
		for (const result of results) {
			expect(typeof result.floorP50Ms).toBe("number");
			expect(typeof result.attributedP50Ms).toBe("number");
		}
	});
});
