import type { DocumentOp, Editor } from "@pen/types";
import { isInsideParentIdContainer } from "../utils/parentIdTree";
import {
	CONTAINER_EXIT_TYPES,
	HEADING_TYPES,
	LIST_BLOCK_TYPES,
	isBlockEmpty,
	type EnterAction,
	type SelectionRange,
	type SelectionTarget,
} from "./commandsShared";
import {
	convertBlock,
	insertTextAtRange,
	normalizeInlineOffset,
	splitBlockAtOffset,
} from "./commandsBlock";

export function resolveEnterAction(
	editor: Editor,
	blockId: string,
	inputMode: "richtext" | "code" | "table" | "none",
	ytext: { length: number; toString(): string },
): EnterAction | null {
	if (inputMode === "code") {
		return { action: "insert-text", text: "\n" };
	}

	if (inputMode !== "richtext") {
		return null;
	}

	const block = editor.getBlock(blockId);
	if (!block) return null;

	const blockType = block.type;
	const empty = isBlockEmpty(ytext);

	if (empty && LIST_BLOCK_TYPES.has(blockType)) {
		return { action: "convert", newType: "paragraph" };
	}

	if (empty && CONTAINER_EXIT_TYPES.has(blockType)) {
		return { action: "convert", newType: "paragraph" };
	}

	if (empty && isInsideParentIdContainer(editor, blockId)) {
		return { action: "lift" };
	}

	if (HEADING_TYPES.has(blockType)) {
		return { action: "split", newBlockType: "paragraph" };
	}

	return { action: "split", newBlockType: undefined };
}

export function applyEnterBehavior(
	editor: Editor,
	options: {
		blockId: string;
		inputMode: "richtext" | "code" | "table" | "none";
		ytext: {
			length: number;
			toString(): string;
			insert(offset: number, text: string): void;
			delete(offset: number, length: number): void;
		};
		range: SelectionRange | null;
	},
): SelectionTarget | null {
	const { blockId, inputMode, ytext, range } = options;

	const enterAction = resolveEnterAction(editor, blockId, inputMode, ytext);
	if (!enterAction) return null;

	switch (enterAction.action) {
		case "insert-text":
			return insertTextAtRange(editor, {
				blockId,
				range,
				text: enterAction.text,
			});

		case "convert":
			return convertBlock(editor, {
				blockId,
				newType: enterAction.newType,
			});

		case "lift":
			return liftBlockOutOfParent(editor, { blockId });

		case "split":
			return splitBlockAtOffset(editor, {
				blockId,
				offset: normalizeInlineOffset(
					ytext,
					range?.start ?? ytext.length,
				),
				newBlockType: enterAction.newBlockType,
			});
	}
}

function liftBlockOutOfParent(
	editor: Editor,
	options: { blockId: string },
): SelectionTarget {
	editor.apply(
		[
			{
				type: "update-block",
				blockId: options.blockId,
				props: { parentId: null },
			} as DocumentOp,
		],
		{ origin: "user" },
	);

	return {
		blockId: options.blockId,
		anchorOffset: 0,
		focusOffset: 0,
	};
}
