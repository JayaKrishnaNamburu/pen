import type { BlockHandle, DocumentOp } from "@input/pen-types";
import { createTestDocument } from "../../createTestDocument";
import { createTestEditor } from "../../createTestEditor";
import type { TestBlock, TestEditor } from "../../types";
import metadata from "./metadata.json";

export const envelopeMetadata = metadata;

export const ENVELOPE_BLOCK_COUNTS = metadata.ladder.blocks;
export const ENVELOPE_LONG_BLOCK_CHARS = metadata.ladder.longBlockChars;
export const ENVELOPE_NESTING_DEPTH = metadata.ladder.nestingDepth;
export const ENVELOPE_TABLE_ROWS = metadata.ladder.tableRows;
export const ENVELOPE_TABLE_COLS = metadata.ladder.tableCols;
export const ENVELOPE_COMMITTED_BLOCK_COUNT =
	metadata.ladder.committedBlockCount;

const LONG_BLOCK_ID = "envelope-long";
const TABLE_BLOCK_ID = "envelope-table";

export function envelopeBlockId(index: number): string {
	return `envelope-block-${index}`;
}

export function envelopeNestId(depth: number): string {
	return `envelope-nest-${depth}`;
}

export function generateBlockSpecs(count: number): TestBlock[] {
	const blocks: TestBlock[] = [];
	for (let index = 0; index < count; index++) {
		const type = blockTypeForIndex(index);
		const block: TestBlock = {
			id: envelopeBlockId(index),
			type,
			content: `Block ${index}`,
		};
		if (type === "heading") {
			block.props = { level: (Math.floor(index / 10) % 3) + 1 };
		}
		blocks.push(block);
	}
	return blocks;
}

export function generateLongBlockSpec(
	chars: number = ENVELOPE_LONG_BLOCK_CHARS,
): TestBlock[] {
	return [
		{
			id: LONG_BLOCK_ID,
			type: "paragraph",
			content: "A".repeat(chars),
		},
	];
}

export function createBlockCountEditor(count: number): TestEditor {
	return createTestEditor({
		doc: createTestDocument(generateBlockSpecs(count)).ydoc,
	});
}

export function createLongBlockEditor(
	chars: number = ENVELOPE_LONG_BLOCK_CHARS,
): TestEditor {
	return createTestEditor({
		doc: createTestDocument(generateLongBlockSpec(chars)).ydoc,
	});
}

export function createNestingEditor(
	depth: number = ENVELOPE_NESTING_DEPTH,
): TestEditor {
	const editor = createTestEditor({ blocks: [] });
	const ops: DocumentOp[] = [];
	for (let level = 0; level < depth; level++) {
		const blockId = envelopeNestId(level);
		if (level === 0) {
			ops.push({
				type: "insert-block",
				blockId,
				blockType: "callout",
				props: { type: "info" },
				position: "last",
			});
			continue;
		}
		const parentId = envelopeNestId(level - 1);
		ops.push({
			type: "insert-block",
			blockId,
			blockType: "callout",
			props: { type: "info", parentId },
			position: { parent: parentId, index: 0 },
		});
	}
	editor.apply(ops, { origin: "user" });
	return editor;
}

export function createTableEditor(
	rows: number = ENVELOPE_TABLE_ROWS,
	cols: number = ENVELOPE_TABLE_COLS,
): TestEditor {
	const editor = createTestEditor({ blocks: [] });
	const ops: DocumentOp[] = [
		{
			type: "insert-block",
			blockId: TABLE_BLOCK_ID,
			blockType: "table",
			props: { hasHeaderRow: true },
			position: "last",
		},
	];
	for (let col = 2; col < cols; col++) {
		ops.push({
			type: "insert-table-column",
			blockId: TABLE_BLOCK_ID,
			index: col,
		});
	}
	for (let row = 2; row < rows; row++) {
		ops.push({
			type: "insert-table-row",
			blockId: TABLE_BLOCK_ID,
			index: row,
		});
	}
	editor.apply(ops, { origin: "user" });
	return editor;
}

export function measureNestingDepth(
	editor: TestEditor,
	rootId: string,
): number {
	let depth = 0;
	let current: BlockHandle | null = editor.getBlock(rootId);
	while (current) {
		depth += 1;
		current = current.children[0] ?? null;
	}
	return depth;
}

export { LONG_BLOCK_ID, TABLE_BLOCK_ID };

function blockTypeForIndex(index: number): string {
	if (index % 10 === 0) {
		return "heading";
	}
	if (index % 5 === 0) {
		return "codeBlock";
	}
	return "paragraph";
}
