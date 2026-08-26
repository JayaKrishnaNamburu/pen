import { generateId, type DocumentOp, type Editor } from "@input/pen-types";

interface StarterTextBlock {
	type: string;
	props?: Record<string, unknown>;
	text: string;
}

interface StarterTableBlock {
	type: "table";
	props?: Record<string, unknown>;
	cells: string[][];
}

type StarterBlock = StarterTextBlock | StarterTableBlock;

const STARTER_BLOCKS: StarterBlock[] = [
	{
		type: "heading",
		props: { level: 1 },
		text: "Pen playground",
	},
	{
		type: "paragraph",
		text: "This is a real Pen editor. Type to edit it, press / for the block menu, and select text to format it.",
	},
	{
		type: "paragraph",
		text: "Ask the agent on the left to write or rewrite something. It edits this document through the same operations your keyboard does.",
	},
	{
		type: "paragraph",
		text: "Open the panel on the right to watch the document state change as you type.",
	},
	{
		type: "heading",
		props: { level: 2 },
		text: "A few blocks to try",
	},
	{
		type: "bulletListItem",
		text: "Type / to insert a heading, list, table, quote, or code block",
	},
	{
		type: "bulletListItem",
		text: "Select a few words and use the toolbar to bold, italicize, or link them",
	},
	{
		type: "bulletListItem",
		text: "Ask the agent to turn this list into a table, or the table into a list",
	},
	{
		type: "numberedListItem",
		text: "Write the heading",
	},
	{
		type: "numberedListItem",
		text: "Add the supporting points",
	},
	{
		type: "numberedListItem",
		text: "Leave a next step at the bottom",
	},
	{
		type: "checkListItem",
		text: "Open the slash menu",
	},
	{
		type: "checkListItem",
		props: { checked: true },
		text: "Try a checklist item",
	},
	{
		type: "table",
		props: { hasHeaderRow: true },
		cells: [
			["Block", "Looks like", "Use for"],
			["Heading", "Large title", "Sections"],
			["List", "Marker and text", "Steps"],
			["Table", "Rows and columns", "Data"],
		],
	},
	{
		type: "blockquote",
		text: "The document is the output. The sidebar on the left is a receipt of what changed.",
	},
	{
		type: "codeBlock",
		props: { language: "ts" },
		text: 'editor.apply(ops, { origin: "user" });',
	},
	{
		type: "callout",
		props: { severity: "info" },
		text: "Press / anywhere in an empty block to see every type the schema knows.",
	},
];

/**
 * Fills a brand-new editor with something to read.
 *
 * Documents are changed by applying operations, which is the only way anything
 * writes to a Pen document — typing, pasting, undo, and the agent all end up
 * here. `set-props` on the first block is how a block changes type.
 */
export function applyStarterDocument(editor: Editor): void {
	const firstBlock = editor.firstBlock();

	// Leave anything that already has content alone.
	if (
		!firstBlock ||
		editor.blockCount() > 1 ||
		firstBlock.textContent() !== ""
	) {
		return;
	}

	const [firstStarter, ...remainingStarters] = STARTER_BLOCKS;
	if (!firstStarter || "cells" in firstStarter) {
		return;
	}

	const ops: DocumentOp[] = [
		{
			type: "set-props",
			blockId: firstBlock.id,
			props: { type: firstStarter.type, ...firstStarter.props },
		},
		{
			type: "splice-text",
			blockId: firstBlock.id,
			from: 0,
			to: 0,
			insert: firstStarter.text,
		},
	];

	let previousBlockId = firstBlock.id;
	for (const starter of remainingStarters) {
		const blockId = generateId();
		if ("cells" in starter) {
			ops.push(...tableOps(blockId, starter, previousBlockId));
		} else {
			ops.push(
				{
					type: "insert-block",
					blockId,
					blockType: starter.type,
					props: starter.props ?? {},
					position: { after: previousBlockId },
				},
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: starter.text,
				},
			);
		}
		previousBlockId = blockId;
	}

	editor.apply(ops, { origin: "system" });
	placeCaretAtEnd(editor);
}

/**
 * A new table is 2×2. Grow it to the starter grid, then fill each cell.
 */
function tableOps(
	blockId: string,
	starter: StarterTableBlock,
	previousBlockId: string,
): DocumentOp[] {
	const rowCount = starter.cells.length;
	const colCount = Math.max(...starter.cells.map((row) => row.length), 1);
	const ops: DocumentOp[] = [
		{
			type: "insert-block",
			blockId,
			blockType: "table",
			props: starter.props ?? {},
			position: { after: previousBlockId },
		},
	];

	for (let col = 2; col < colCount; col++) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "insert-column", index: col },
		});
	}
	for (let row = 2; row < rowCount; row++) {
		ops.push({
			type: "grid",
			blockId,
			change: { kind: "insert-row", index: row },
		});
	}

	for (let row = 0; row < rowCount; row++) {
		const cells = starter.cells[row] ?? [];
		for (let col = 0; col < colCount; col++) {
			const text = cells[col];
			if (!text) {
				continue;
			}
			ops.push({
				type: "splice-text",
				blockId,
				cell: { row, col },
				from: 0,
				to: 0,
				insert: text,
			});
		}
	}

	return ops;
}

/**
 * Without a selection the toolbar has no block to describe and the first
 * keystroke has nowhere to go, so the document opens with a caret the way a
 * word processor does.
 */
function placeCaretAtEnd(editor: Editor): void {
	const lastBlockId = editor.documentState.blockOrder.at(-1);
	const lastBlock = lastBlockId ? editor.getBlock(lastBlockId) : null;
	if (!lastBlock) {
		return;
	}

	const end = lastBlock.textContent().length;
	editor.selectText(lastBlock.id, end, end);
}
