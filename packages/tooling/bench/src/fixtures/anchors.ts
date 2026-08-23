import * as Y from "yjs";

export const ANCHOR_WORD = "meadow ";
export const ANCHOR_WORD_REPEAT = 10_000;
export const ANCHOR_ENCODE_COUNT = 1_000;
export const ANCHOR_BLOCK_COUNT = 200;
export const ANCHOR_CELL_ROWS = 20;
export const ANCHOR_CELL_COLS = 10;
export const ANCHOR_CELL_COUNT = ANCHOR_CELL_ROWS * ANCHOR_CELL_COLS;
export const ANCHOR_CELL_ROW = 1;
export const ANCHOR_CELL_COL = 1;
export const CELL_EDIT_TEXT = "0123456789";
export const CELL_EDIT_OFFSET = 5;
export const CELL_INSERT_TEXT = "xx";
export const CELL_INSERT_AT = 0;
export const CELL_DELETE_AT = 3;
export const CELL_DELETE_LENGTH = 4;
/**
 * Pen copy-split (`split-block`) copies tail text onto a new `Y.Text`.
 * `split-table-cell` is a validated no-op in `TableGridExecutor`, so a
 * cell cannot undergo that structural edit. Do not invent a cell analog.
 */
export const CELL_COPY_SPLIT_ANALOG: null = null;
export const SPLIT_SOURCE_TEXT = "meadow sage";
export const SPLIT_OFFSET = 6;
export const SPLIT_HEAD_TEXT = "meadow";
export const SPLIT_TAIL_TEXT = " sage";

export interface MintedAnchor {
	offset: number;
	assoc: number;
	encoded: Uint8Array;
	type: Y.Text;
}

export interface ResolvedAnchor {
	index: number | null;
	type: Y.Text | null;
	deleted: boolean;
}

export function createPenShapedDoc(clientID = 0): {
	doc: Y.Doc;
	blocks: Y.Map<Y.Map<unknown>>;
} {
	const doc = new Y.Doc({ gc: false });
	doc.clientID = clientID;
	const blocks = doc.getMap<Y.Map<unknown>>("blocks");
	return { doc, blocks };
}

export function insertBlockText(
	doc: Y.Doc,
	blocks: Y.Map<Y.Map<unknown>>,
	blockId: string,
	text: string,
): Y.Text {
	const content = new Y.Text();
	const block = new Y.Map<unknown>();
	doc.transact(() => {
		content.insert(0, text);
		block.set("type", "paragraph");
		block.set("content", content);
		blocks.set(blockId, block);
	});
	return content;
}

export function insertTableBlock(
	doc: Y.Doc,
	blocks: Y.Map<Y.Map<unknown>>,
	tableId: string,
	rows: number,
	cols: number,
): Y.Map<unknown> {
	const block = new Y.Map<unknown>();
	const tableContent = new Y.Array<Y.Map<unknown>>();
	doc.transact(() => {
		for (let row = 0; row < rows; row++) {
			const rowMap = new Y.Map<unknown>();
			rowMap.set("id", `${tableId}-r${row}`);
			const cells = new Y.Array<Y.Map<unknown>>();
			for (let col = 0; col < cols; col++) {
				const cell = new Y.Map<unknown>();
				cell.set("id", `${tableId}-r${row}-c${col}`);
				cell.set("content", new Y.Text());
				cells.push([cell]);
			}
			rowMap.set("cells", cells);
			tableContent.push([rowMap]);
		}
		block.set("type", "table");
		block.set("tableContent", tableContent);
		blocks.set(tableId, block);
	});
	return block;
}

export function getTableCellText(
	block: Y.Map<unknown>,
	row: number,
	col: number,
): Y.Text {
	const tableContent = block.get("tableContent");
	if (!(tableContent instanceof Y.Array)) {
		throw new Error("getTableCellText: tableContent missing");
	}
	const rowMap = tableContent.get(row);
	if (!(rowMap instanceof Y.Map)) {
		throw new Error(`getTableCellText: row ${row} missing`);
	}
	const cells = rowMap.get("cells");
	if (!(cells instanceof Y.Array)) {
		throw new Error("getTableCellText: cells missing");
	}
	const cell = cells.get(col);
	if (!(cell instanceof Y.Map)) {
		throw new Error(`getTableCellText: cell ${row},${col} missing`);
	}
	const content = cell.get("content");
	if (!(content instanceof Y.Text)) {
		throw new Error(`getTableCellText: cell ${row},${col} has no Y.Text`);
	}
	return content;
}

export function mintEncoded(
	text: Y.Text,
	offset: number,
	assoc: number,
): Uint8Array {
	const relative = Y.createRelativePositionFromTypeIndex(text, offset, assoc);
	return Y.encodeRelativePosition(relative);
}

export function resolveEncoded(doc: Y.Doc, encoded: Uint8Array): ResolvedAnchor {
	const relative = Y.decodeRelativePosition(encoded);
	const absolute = Y.createAbsolutePositionFromRelativePosition(relative, doc);
	if (!absolute) {
		return { index: null, type: null, deleted: false };
	}
	const type = absolute.type as Y.Text;
	return {
		index: absolute.index,
		type,
		deleted: type._item?.deleted === true,
	};
}

export function createScaleTextFixture(): {
	doc: Y.Doc;
	content: Y.Text;
	text: string;
	encoded: Uint8Array[];
	offsets: number[];
} {
	const { doc, blocks } = createPenShapedDoc();
	const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
	const content = insertBlockText(doc, blocks, "b1", text);
	const encoded: Uint8Array[] = [];
	const offsets: number[] = [];
	for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
		const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
		offsets.push(offset);
		encoded.push(mintEncoded(content, offset, 1));
	}
	return { doc, content, text, encoded, offsets };
}

export function createBlockScaleFixture(): {
	doc: Y.Doc;
	encoded: Uint8Array[];
	blockIds: string[];
} {
	const { doc, blocks } = createPenShapedDoc();
	const encoded: Uint8Array[] = [];
	const blockIds: string[] = [];
	for (let i = 0; i < ANCHOR_BLOCK_COUNT; i++) {
		const id = `b${i}`;
		blockIds.push(id);
		const content = insertBlockText(doc, blocks, id, `block text ${i}`);
		encoded.push(mintEncoded(content, 0, 1));
	}
	return { doc, encoded, blockIds };
}

export function createCellScaleTextFixture(): {
	doc: Y.Doc;
	block: Y.Map<unknown>;
	content: Y.Text;
	text: string;
	encoded: Uint8Array[];
	offsets: number[];
	cell: { row: number; col: number };
} {
	const { doc, blocks } = createPenShapedDoc();
	const text = ANCHOR_WORD.repeat(ANCHOR_WORD_REPEAT);
	const block = insertTableBlock(doc, blocks, "t1", 2, 2);
	const content = getTableCellText(block, ANCHOR_CELL_ROW, ANCHOR_CELL_COL);
	doc.transact(() => {
		content.insert(0, text);
	});
	const encoded: Uint8Array[] = [];
	const offsets: number[] = [];
	for (let i = 0; i < ANCHOR_ENCODE_COUNT; i++) {
		const offset = Math.floor((i / ANCHOR_ENCODE_COUNT) * text.length);
		offsets.push(offset);
		encoded.push(mintEncoded(content, offset, 1));
	}
	return {
		doc,
		block,
		content,
		text,
		encoded,
		offsets,
		cell: { row: ANCHOR_CELL_ROW, col: ANCHOR_CELL_COL },
	};
}

export function createCellGridFixture(): {
	doc: Y.Doc;
	block: Y.Map<unknown>;
	encoded: Uint8Array[];
	cells: Y.Text[];
	coords: Array<{ row: number; col: number }>;
} {
	const { doc, blocks } = createPenShapedDoc();
	const block = insertTableBlock(
		doc,
		blocks,
		"t1",
		ANCHOR_CELL_ROWS,
		ANCHOR_CELL_COLS,
	);
	const encoded: Uint8Array[] = [];
	const cells: Y.Text[] = [];
	const coords: Array<{ row: number; col: number }> = [];
	doc.transact(() => {
		let index = 0;
		for (let row = 0; row < ANCHOR_CELL_ROWS; row++) {
			for (let col = 0; col < ANCHOR_CELL_COLS; col++) {
				const content = getTableCellText(block, row, col);
				content.insert(0, `cell text ${index}`);
				cells.push(content);
				coords.push({ row, col });
				encoded.push(mintEncoded(content, 0, 1));
				index += 1;
			}
		}
	});
	return { doc, block, encoded, cells, coords };
}

export interface CellEditObservation {
	text: string;
	resolvedIndex: number | null;
	expectedIndex: number;
	onCell: boolean;
	onWrongType: boolean;
}

export function measureCellInBlockEdit(): {
	tableHasContent: boolean;
	insert: CellEditObservation;
	delete: CellEditObservation;
} {
	const insert = runCellEdit((cell, doc) => {
		const encoded = mintEncoded(cell, CELL_EDIT_OFFSET, 1);
		doc.transact(() => {
			cell.insert(CELL_INSERT_AT, CELL_INSERT_TEXT);
		});
		return {
			encoded,
			expectedIndex: CELL_EDIT_OFFSET + CELL_INSERT_TEXT.length,
		};
	});
	const deleted = runCellEdit((cell, doc) => {
		const encoded = mintEncoded(cell, CELL_EDIT_OFFSET, 1);
		doc.transact(() => {
			cell.delete(CELL_DELETE_AT, CELL_DELETE_LENGTH);
		});
		return { encoded, expectedIndex: CELL_DELETE_AT };
	});
	return {
		tableHasContent: insert.tableHasContent || deleted.tableHasContent,
		insert: insert.observation,
		delete: deleted.observation,
	};
}

function runCellEdit(
	edit: (
		cell: Y.Text,
		doc: Y.Doc,
	) => { encoded: Uint8Array; expectedIndex: number },
): {
	tableHasContent: boolean;
	observation: CellEditObservation;
} {
	const { doc, blocks } = createPenShapedDoc();
	const block = insertTableBlock(doc, blocks, "t1", 2, 2);
	const cell = getTableCellText(block, ANCHOR_CELL_ROW, ANCHOR_CELL_COL);
	doc.transact(() => {
		cell.insert(0, CELL_EDIT_TEXT);
	});
	const { encoded, expectedIndex } = edit(cell, doc);
	const resolved = resolveEncoded(doc, encoded);
	const tableContent = block.get("content");
	return {
		tableHasContent: tableContent instanceof Y.Text,
		observation: {
			text: cell.toString(),
			resolvedIndex: resolved.index,
			expectedIndex,
			onCell: resolved.type === cell,
			onWrongType: resolved.type !== cell,
		},
	};
}

export function splitBlockCopy(
	source: Y.Text,
	dest: Y.Text,
	offset: number,
): void {
	const deltas = source.toDelta();
	const tailDeltas: Array<{
		insert: string | object;
		attributes?: Record<string, unknown>;
	}> = [];
	let pos = 0;
	for (const delta of deltas) {
		const insert = delta.insert;
		const len = typeof insert === "string" ? insert.length : 1;
		if (pos + len <= offset) {
			pos += len;
			continue;
		}
		if (pos < offset && typeof insert === "string") {
			const tailText = insert.slice(offset - pos);
			if (tailText) {
				tailDeltas.push({
					insert: tailText,
					attributes: delta.attributes,
				});
			}
		} else {
			tailDeltas.push(delta);
		}
		pos += len;
	}
	const totalLength = source.length;
	source.doc?.transact(() => {
		if (offset < totalLength) {
			source.delete(offset, totalLength - offset);
		}
		for (const delta of tailDeltas) {
			dest.insert(
				dest.length,
				delta.insert as string,
				delta.attributes,
			);
		}
	});
}

export interface SplitFollowCase {
	name: string;
	offset: number;
	assoc: number;
	v2Block: "src" | "dest";
	v2Offset: number;
}

export const SPLIT_FOLLOW_CASES: SplitFollowCase[] = [
	{ name: "head", offset: 3, assoc: 1, v2Block: "src", v2Offset: 3 },
	{
		name: "split-assoc-minus1",
		offset: SPLIT_OFFSET,
		assoc: -1,
		v2Block: "src",
		v2Offset: SPLIT_OFFSET,
	},
	{
		name: "split-assoc-plus1",
		offset: SPLIT_OFFSET,
		assoc: 1,
		v2Block: "dest",
		v2Offset: 0,
	},
	{ name: "tail", offset: 9, assoc: 1, v2Block: "dest", v2Offset: 3 },
];

export interface SplitFollowResult {
	name: string;
	resolvedIndex: number | null;
	onSource: boolean;
	onDest: boolean;
	matchesV2: boolean;
	stuckOnSource: boolean;
}

export function measureSplitFollow(): {
	sourceText: string;
	destText: string;
	results: SplitFollowResult[];
	stuckCount: number;
	followedCount: number;
	v2MismatchCount: number;
} {
	const { doc, blocks } = createPenShapedDoc();
	const source = insertBlockText(doc, blocks, "src", SPLIT_SOURCE_TEXT);
	const dest = insertBlockText(doc, blocks, "dest", "");
	const minted: MintedAnchor[] = SPLIT_FOLLOW_CASES.map((entry) => ({
		offset: entry.offset,
		assoc: entry.assoc,
		encoded: mintEncoded(source, entry.offset, entry.assoc),
		type: source,
	}));

	splitBlockCopy(source, dest, SPLIT_OFFSET);

	const results = SPLIT_FOLLOW_CASES.map((entry, index) => {
		const mintedAnchor = minted[index]!;
		const resolved = resolveEncoded(doc, mintedAnchor.encoded);
		const onSource = resolved.type === source;
		const onDest = resolved.type === dest;
		const matchesV2 =
			(entry.v2Block === "src" ? onSource : onDest) &&
			resolved.index === entry.v2Offset;
		const stuckOnSource =
			entry.v2Block === "dest" && onSource && !onDest;
		return {
			name: entry.name,
			resolvedIndex: resolved.index,
			onSource,
			onDest,
			matchesV2,
			stuckOnSource,
		};
	});

	return {
		sourceText: source.toString(),
		destText: dest.toString(),
		results,
		stuckCount: results.filter((result) => result.stuckOnSource).length,
		followedCount: results.filter((result) => result.matchesV2).length,
		v2MismatchCount: results.filter((result) => !result.matchesV2).length,
	};
}

export function encodeSizes(encoded: readonly Uint8Array[]): {
	minBytes: number;
	maxBytes: number;
	p50Bytes: number;
	p95Bytes: number;
	count: number;
} {
	if (encoded.length === 0) {
		throw new Error("encodeSizes: empty population");
	}
	const sizes = encoded.map((item) => item.byteLength).sort((a, b) => a - b);
	const atPercentile = (percentile: number) => {
		const index = Math.min(
			sizes.length - 1,
			Math.max(0, Math.ceil((percentile / 100) * sizes.length) - 1),
		);
		return sizes[index] ?? 0;
	};
	return {
		minBytes: sizes[0] ?? 0,
		maxBytes: sizes[sizes.length - 1] ?? 0,
		p50Bytes: atPercentile(50),
		p95Bytes: atPercentile(95),
		count: sizes.length,
	};
}
