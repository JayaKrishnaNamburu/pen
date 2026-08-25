import { generateId, type DocumentOp, type Editor } from "@input/pen-types";

interface StarterBlock {
	type: string;
	props?: Record<string, unknown>;
	text: string;
}

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
		text: "Ask the assistant on the left to write or rewrite something. It edits this document through the same operations your keyboard does.",
	},
	{
		type: "paragraph",
		text: "Open the panel on the right to watch the document state change as you type.",
	},
];

/**
 * Fills a brand-new editor with something to read.
 *
 * Documents are changed by applying operations, which is the only way anything
 * writes to a Pen document — typing, pasting, undo, and the assistant all end
 * up here. `set-props` on the first block is how a block changes type.
 */
export function applyStarterDocument(editor: Editor): void {
	const firstBlock = editor.firstBlock();

	// Leave anything that already has content alone.
	if (!firstBlock || editor.blockCount() > 1 || firstBlock.textContent() !== "") {
		return;
	}

	const [firstStarter, ...remainingStarters] = STARTER_BLOCKS;
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
		previousBlockId = blockId;
	}

	editor.apply(ops, { origin: "system" });
	placeCaretAtEnd(editor);
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
