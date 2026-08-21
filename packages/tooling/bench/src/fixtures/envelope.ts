import {
	createTestDocument,
	createTestEditor,
	createTwoPeerHarness,
} from "@input/pen-test";
import type { BlockHandle, DocumentOp } from "@input/pen-types";
import type { TestBlock, TestEditor } from "@input/pen-test";
import * as Y from "yjs";
import {
	SCALE1_LONG_BLOCK_CHARS,
	SCALE1_NESTING_DEPTH,
	SCALE1_TABLE_COLS,
	SCALE1_TABLE_ROWS,
	assertNeverEnvelopeRung,
	type EnvelopeRungId,
} from "../constants/scale1";

export const ENVELOPE_LONG_BLOCK_ID = "envelope-long";
export const ENVELOPE_TABLE_BLOCK_ID = "envelope-table";

const seedUpdates = new Map<string, Uint8Array>();

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
	chars: number = SCALE1_LONG_BLOCK_CHARS,
): TestBlock[] {
	return [
		{
			id: ENVELOPE_LONG_BLOCK_ID,
			type: "paragraph",
			content: "A".repeat(chars),
		},
	];
}

export function createEnvelopeYDoc(rungId: EnvelopeRungId): Y.Doc {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, seedUpdate(rungId));
	return ydoc;
}

export function createEnvelopeEditor(rungId: EnvelopeRungId): TestEditor {
	if (rungId === "concurrentPeers-2") {
		throw new Error(
			"concurrentPeers-2 uses createEnvelopeCollaboration, not a single editor",
		);
	}
	return createTestEditor({ doc: createEnvelopeYDoc(rungId) });
}

export function createEnvelopeCollaboration(blockCount = 100) {
	// Shared-seed fork. Independent populateYDoc histories lose one side
	// on sync; createTwoPeerHarness is the path that actually collaborates.
	const harness = createTwoPeerHarness({
		blocks: generateBlockSpecs(blockCount),
	});
	return {
		editorA: harness.peerA.editor,
		editorB: harness.peerB.editor,
		sync() {
			harness.sync();
		},
	};
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

export interface EnvelopeKeystroke {
	ops: DocumentOp[];
	targetId: string;
}

export function envelopeKeystroke(rungId: EnvelopeRungId): EnvelopeKeystroke {
	switch (rungId) {
		case "blocks-100":
			return blockCountKeystroke(100);
		case "blocks-1000":
			return blockCountKeystroke(1000);
		case "blocks-5000":
			return blockCountKeystroke(5000);
		case "long-block":
			return {
				ops: [
					{
						type: "insert-text",
						blockId: ENVELOPE_LONG_BLOCK_ID,
						offset: SCALE1_LONG_BLOCK_CHARS,
						text: "x",
					},
				],
				targetId: ENVELOPE_LONG_BLOCK_ID,
			};
		case "nesting-10": {
			const blockId = envelopeNestId(SCALE1_NESTING_DEPTH - 1);
			return {
				ops: [
					{
						type: "insert-text",
						blockId,
						offset: 0,
						text: "x",
					},
				],
				targetId: blockId,
			};
		}
		case "table-50x20":
			return {
				ops: [
					{
						type: "insert-table-cell-text",
						blockId: ENVELOPE_TABLE_BLOCK_ID,
						row: SCALE1_TABLE_ROWS - 1,
						col: SCALE1_TABLE_COLS - 1,
						offset: 0,
						text: "x",
					},
				],
				targetId: ENVELOPE_TABLE_BLOCK_ID,
			};
		case "concurrentPeers-2":
			return blockCountKeystroke(100);
		default:
			return assertNeverEnvelopeRung(rungId);
	}
}

function blockCountKeystroke(count: number): EnvelopeKeystroke {
	const blockId = envelopeBlockId(Math.floor(count / 2));
	return {
		ops: [
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "x",
			},
		],
		targetId: blockId,
	};
}

function seedUpdate(rungId: EnvelopeRungId): Uint8Array {
	const cached = seedUpdates.get(rungId);
	if (cached) {
		return cached;
	}

	const ydoc = buildRungYDoc(rungId);
	const update = Y.encodeStateAsUpdate(ydoc);
	seedUpdates.set(rungId, update);
	return update;
}

function buildRungYDoc(rungId: EnvelopeRungId): Y.Doc {
	switch (rungId) {
		case "blocks-100":
			return createTestDocument(generateBlockSpecs(100)).ydoc;
		case "blocks-1000":
			return createTestDocument(generateBlockSpecs(1000)).ydoc;
		case "blocks-5000":
			return createTestDocument(generateBlockSpecs(5000)).ydoc;
		case "long-block":
			return createTestDocument(generateLongBlockSpec()).ydoc;
		case "nesting-10":
			return buildNestingYDoc();
		case "table-50x20":
			return buildTableYDoc();
		case "concurrentPeers-2":
			return createTestDocument(generateBlockSpecs(100)).ydoc;
		default:
			return assertNeverEnvelopeRung(rungId);
	}
}

function buildNestingYDoc(): Y.Doc {
	const editor = createTestEditor({ blocks: [] });
	const ops: DocumentOp[] = [];
	for (let level = 0; level < SCALE1_NESTING_DEPTH; level++) {
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
	const ydoc = snapshotYDoc(editor.ydoc);
	void editor.destroy();
	return ydoc;
}

function buildTableYDoc(): Y.Doc {
	const editor = createTestEditor({ blocks: [] });
	const ops: DocumentOp[] = [
		{
			type: "insert-block",
			blockId: ENVELOPE_TABLE_BLOCK_ID,
			blockType: "table",
			props: { hasHeaderRow: true },
			position: "last",
		},
	];
	for (let col = 2; col < SCALE1_TABLE_COLS; col++) {
		ops.push({
			type: "insert-table-column",
			blockId: ENVELOPE_TABLE_BLOCK_ID,
			index: col,
		});
	}
	for (let row = 2; row < SCALE1_TABLE_ROWS; row++) {
		ops.push({
			type: "insert-table-row",
			blockId: ENVELOPE_TABLE_BLOCK_ID,
			index: row,
		});
	}
	editor.apply(ops, { origin: "user" });
	const ydoc = snapshotYDoc(editor.ydoc);
	void editor.destroy();
	return ydoc;
}

function snapshotYDoc(source: Y.Doc): Y.Doc {
	const ydoc = new Y.Doc();
	Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(source));
	return ydoc;
}

function blockTypeForIndex(index: number): string {
	if (index % 10 === 0) {
		return "heading";
	}
	if (index % 5 === 0) {
		return "codeBlock";
	}
	return "paragraph";
}
