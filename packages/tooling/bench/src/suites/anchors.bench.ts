import os from "node:os";
import type { BenchContext, BenchDefinition } from "../bench";
import {
	ANCHORS_CELL_IN_BLOCK_EDIT_BENCH,
	ANCHORS_ENCODE_SIZE_1000_BENCH,
	ANCHORS_ENCODE_SIZE_CELL_1000_BENCH,
	ANCHORS_RESOLVE_200_BLOCKS_BENCH,
	ANCHORS_RESOLVE_200_CELLS_BENCH,
	ANCHORS_RESOLVE_70K_1000_BENCH,
	ANCHORS_RESOLVE_CELL_70K_1000_BENCH,
	ANCHORS_SPLIT_FOLLOW_BENCH,
} from "../constants/benchmarks";
import {
	ANCHOR_BLOCK_COUNT,
	ANCHOR_CELL_COL,
	ANCHOR_CELL_COUNT,
	ANCHOR_CELL_ROW,
	ANCHOR_ENCODE_COUNT,
	SPLIT_HEAD_TEXT,
	SPLIT_TAIL_TEXT,
	ANCHOR_WORD,
	ANCHOR_WORD_REPEAT,
	createBlockScaleFixture,
	createCellGridFixture,
	createCellScaleTextFixture,
	createPenShapedDoc,
	createScaleTextFixture,
	encodeSizes,
	insertBlockText,
	insertTableBlock,
	getTableCellText,
	measureCellInBlockEdit,
	measureSplitFollow,
	mintEncoded,
	resolveEncoded,
} from "../fixtures/anchors";

export {
	ANCHORS_CELL_IN_BLOCK_EDIT_BENCH,
	ANCHORS_ENCODE_SIZE_CELL_1000_BENCH,
	ANCHORS_RESOLVE_200_CELLS_BENCH,
	ANCHORS_RESOLVE_CELL_70K_1000_BENCH,
};

function loadavg1(): number {
	return os.loadavg()[0] ?? 0;
}

function iterateEncodedFloor(count: number): (b: BenchContext) => void {
	return (b) => {
		b.start();
		let bytes = 0;
		for (let i = 0; i < count; i++) {
			bytes += i;
		}
		b.end();
		b.setMetrics({ walkCount: count, walkBytes: bytes });
	};
}

export const anchorsBenchmarks: BenchDefinition[] = [
	{
		...ANCHORS_ENCODE_SIZE_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const { doc, blocks } = createPenShapedDoc();
			const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
			const content = insertBlockText(doc, blocks, "b1", text);
			const encoded: Uint8Array[] = [];
			b.start();
			for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
				const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
				encoded.push(mintEncoded(content, offset, 1));
			}
			b.end();
			const sizes = encodeSizes(encoded);
			if (sizes.count !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`encode size bench minted ${sizes.count}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			if (sizes.minBytes < 1) {
				throw new Error("encode size bench produced empty encodings");
			}
			b.observe("encodeCount", sizes.count, ANCHOR_ENCODE_COUNT);
			b.setMetrics({
				encodeCount: sizes.count,
				minBytes: sizes.minBytes,
				p50Bytes: sizes.p50Bytes,
				p95Bytes: sizes.p95Bytes,
				maxBytes: sizes.maxBytes,
				charCount: text.length,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_70K_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const fixture = createScaleTextFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`resolve 70k bench resolved ${resolved.length}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			for (let i = 0; i < resolved.length; i++) {
				const point = resolved[i]!;
				if (point.index !== fixture.offsets[i]) {
					throw new Error(
						`resolve 70k bench index ${point.index} !== mint ${fixture.offsets[i]} at ${i}`,
					);
				}
				if (point.type !== fixture.content) {
					throw new Error("resolve 70k bench left its Y.Text");
				}
			}
			b.observe("resolveCount", resolved.length, ANCHOR_ENCODE_COUNT);
			b.setMetrics({
				resolveCount: resolved.length,
				charCount: fixture.text.length,
				nullCount: 0,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_200_BLOCKS_BENCH,
		floor: iterateEncodedFloor(ANCHOR_BLOCK_COUNT),
		fn(b) {
			const fixture = createBlockScaleFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_BLOCK_COUNT) {
				throw new Error(
					`resolve 200-block bench resolved ${resolved.length}, expected ${ANCHOR_BLOCK_COUNT}`,
				);
			}
			if (resolved.some((point) => point.index !== 0 || point.type == null)) {
				throw new Error("resolve 200-block bench missed a mint-at-0");
			}
			b.observe("resolveCount", resolved.length, ANCHOR_BLOCK_COUNT);
			b.setMetrics({
				resolveCount: resolved.length,
				blockCount: fixture.blockIds.length,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_SPLIT_FOLLOW_BENCH,
		floor: iterateEncodedFloor(4),
		fn(b) {
			b.start();
			const measured = measureSplitFollow();
			b.end();
			if (measured.sourceText !== SPLIT_HEAD_TEXT) {
				throw new Error(
					`split bench source is ${JSON.stringify(measured.sourceText)}, expected ${SPLIT_HEAD_TEXT}`,
				);
			}
			if (measured.destText !== SPLIT_TAIL_TEXT) {
				throw new Error(
					`split bench dest is ${JSON.stringify(measured.destText)}, expected ${SPLIT_TAIL_TEXT}`,
				);
			}
			const tail = measured.results.find((result) => result.name === "tail");
			if (!tail?.stuckOnSource) {
				throw new Error("split bench tail followed the copy; substrate changed");
			}
			b.observe("stuckCount", measured.stuckCount, 2);
			b.setMetrics({
				stuckCount: measured.stuckCount,
				followedCount: measured.followedCount,
				v2MismatchCount: measured.v2MismatchCount,
				sourceChars: measured.sourceText.length,
				destChars: measured.destText.length,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_ENCODE_SIZE_CELL_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const { doc, blocks } = createPenShapedDoc();
			const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
			const block = insertTableBlock(doc, blocks, "t1", 2, 2);
			const content = getTableCellText(block, ANCHOR_CELL_ROW, ANCHOR_CELL_COL);
			doc.transact(() => {
				content.insert(0, text);
			});
			const encoded: Uint8Array[] = [];
			b.start();
			for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
				const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
				encoded.push(mintEncoded(content, offset, 1));
			}
			b.end();
			const sizes = encodeSizes(encoded);
			if (sizes.count !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`encode cell bench minted ${sizes.count}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			if (sizes.minBytes < 1) {
				throw new Error("encode cell bench produced empty encodings");
			}
			const first = resolveEncoded(doc, encoded[0]!);
			const last = resolveEncoded(doc, encoded[encoded.length - 1]!);
			if (first.type !== content || last.type !== content) {
				throw new Error("encode cell bench resolved off the cell Y.Text");
			}
			if (block.get("content") != null) {
				throw new Error("encode cell bench table has block.content");
			}
			b.observe("encodeCount", sizes.count, ANCHOR_ENCODE_COUNT);
			b.setMetrics({
				encodeCount: sizes.count,
				minBytes: sizes.minBytes,
				p50Bytes: sizes.p50Bytes,
				p95Bytes: sizes.p95Bytes,
				maxBytes: sizes.maxBytes,
				charCount: text.length,
				resolvedOnCell: 1,
				tableHasContent: 0,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_CELL_70K_1000_BENCH,
		floor: iterateEncodedFloor(ANCHOR_ENCODE_COUNT),
		fn(b) {
			const fixture = createCellScaleTextFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_ENCODE_COUNT) {
				throw new Error(
					`resolve cell 70k bench resolved ${resolved.length}, expected ${ANCHOR_ENCODE_COUNT}`,
				);
			}
			let wrongTypeCount = 0;
			for (let i = 0; i < resolved.length; i++) {
				const point = resolved[i]!;
				if (point.index !== fixture.offsets[i]) {
					throw new Error(
						`resolve cell 70k bench index ${point.index} !== mint ${fixture.offsets[i]} at ${i}`,
					);
				}
				if (point.type !== fixture.content) {
					wrongTypeCount += 1;
				}
			}
			if (wrongTypeCount !== 0) {
				throw new Error(
					`resolve cell 70k bench left its cell Y.Text (${wrongTypeCount} misses)`,
				);
			}
			if (fixture.block.get("content") != null) {
				throw new Error("resolve cell 70k bench table has block.content");
			}
			b.observe("resolveCount", resolved.length, ANCHOR_ENCODE_COUNT);
			b.setMetrics({
				resolveCount: resolved.length,
				charCount: fixture.text.length,
				nullCount: 0,
				wrongTypeCount,
				tableHasContent: 0,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_RESOLVE_200_CELLS_BENCH,
		floor: iterateEncodedFloor(ANCHOR_CELL_COUNT),
		fn(b) {
			const fixture = createCellGridFixture();
			b.start();
			const resolved = fixture.encoded.map((encoded) =>
				resolveEncoded(fixture.doc, encoded),
			);
			b.end();
			if (resolved.length !== ANCHOR_CELL_COUNT) {
				throw new Error(
					`resolve 200-cell bench resolved ${resolved.length}, expected ${ANCHOR_CELL_COUNT}`,
				);
			}
			let wrongTypeCount = 0;
			for (let i = 0; i < resolved.length; i++) {
				const point = resolved[i]!;
				if (point.index !== 0 || point.type !== fixture.cells[i]) {
					wrongTypeCount += 1;
				}
			}
			if (wrongTypeCount !== 0) {
				throw new Error(
					`resolve 200-cell bench missed a cell mint-at-0 (${wrongTypeCount} misses)`,
				);
			}
			if (fixture.block.get("content") != null) {
				throw new Error("resolve 200-cell bench table has block.content");
			}
			b.observe("resolveCount", resolved.length, ANCHOR_CELL_COUNT);
			b.setMetrics({
				resolveCount: resolved.length,
				cellCount: fixture.cells.length,
				wrongTypeCount,
				tableHasContent: 0,
				loadavg1: loadavg1(),
			});
		},
	},
	{
		...ANCHORS_CELL_IN_BLOCK_EDIT_BENCH,
		floor: iterateEncodedFloor(2),
		fn(b) {
			b.start();
			const measured = measureCellInBlockEdit();
			b.end();
			if (!measured.insert.onCell || measured.insert.onWrongType) {
				throw new Error("cell in-block insert left the cell Y.Text");
			}
			if (measured.insert.resolvedIndex !== measured.insert.expectedIndex) {
				throw new Error(
					`cell in-block insert index ${measured.insert.resolvedIndex} !== ${measured.insert.expectedIndex}`,
				);
			}
			if (!measured.delete.onCell || measured.delete.onWrongType) {
				throw new Error("cell in-block delete left the cell Y.Text");
			}
			if (measured.delete.resolvedIndex !== measured.delete.expectedIndex) {
				throw new Error(
					`cell in-block delete index ${measured.delete.resolvedIndex} !== ${measured.delete.expectedIndex}`,
				);
			}
			if (measured.tableHasContent) {
				throw new Error("cell in-block edit table has block.content");
			}
			b.observe("insertOnCell", measured.insert.onCell ? 1 : 0, 1);
			b.setMetrics({
				insertShifted: measured.insert.resolvedIndex,
				insertExpected: measured.insert.expectedIndex,
				insertOnCell: 1,
				deleteCollapsed: measured.delete.resolvedIndex,
				deleteExpected: measured.delete.expectedIndex,
				deleteOnCell: 1,
				tableHasContent: 0,
				loadavg1: loadavg1(),
			});
		},
	},
];
