import type { CommandResult, Editor } from "@input/pen-types";
import { generateId } from "@input/pen-types";

import { buildSplitBlockRecipe } from "../ops/recipes";
import {
	CONTAINER_EXIT_TYPES,
	collapsedAt,
	getAdjacentVisibleBlockId,
	getBlockInputMode,
	getListIndent,
	HEADING_TYPES,
	isInsideParentIdContainer,
	isListBlock,
	LIST_BLOCK_TYPES,
	readTextFocus,
} from "./helpers";
import { applyConvert } from "./textConvert";
import { handleInsertText } from "./textInsert";

export function handleSplitBlock(editor: Editor): CommandResult | false {
	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}

	const inputMode = getBlockInputMode(editor, focus.blockId);
	const action = resolveEnterAction(editor, focus.blockId, inputMode);
	if (!action) {
		return false;
	}

	switch (action.action) {
		case "insert-text":
			return handleInsertText(editor, { text: action.text });
		case "convert":
			return applyConvert(editor, {
				blockId: focus.blockId,
				newType: action.newType,
			});
		case "lift":
			editor.apply(
				[
					{
						type: "set-props",
						blockId: focus.blockId,
						props: { parentId: null },
					},
				],
				{ origin: "user" },
			);
			return { selection: collapsedAt(focus.blockId, 0) };
		case "split": {
			const block = editor.getBlock(focus.blockId);
			if (!block) {
				return false;
			}
			const newBlockId = generateId();
			const recipe = buildSplitBlockRecipe({
				block,
				offset: focus.offset,
				newBlockId,
				newBlockType: action.newBlockType,
			});
			editor.apply(recipe.ops, {
				origin: "user",
				structural: recipe.structural,
			});
			return { selection: collapsedAt(newBlockId, 0) };
		}
		default: {
			const _exhaustive: never = action;
			return _exhaustive;
		}
	}
}

export function handleListIndent(
	editor: Editor,
	shiftKey: boolean,
): CommandResult | false {
	const focus = readTextFocus(editor);
	if (!focus) {
		return false;
	}
	const block = editor.getBlock(focus.blockId);
	if (!isListBlock(block)) {
		return false;
	}

	const currentIndent = getListIndent(block);
	let nextIndent = currentIndent;
	if (shiftKey) {
		nextIndent = Math.max(0, currentIndent - 1);
	} else {
		const previousBlockId = getAdjacentVisibleBlockId(
			editor,
			focus.blockId,
			"previous",
		);
		const previousBlock = previousBlockId
			? editor.getBlock(previousBlockId)
			: null;
		const sharesParent =
			previousBlockId !== null &&
			editor.documentState.parentOf(previousBlockId) ===
				editor.documentState.parentOf(focus.blockId);
		if (
			isListBlock(previousBlock) &&
			sharesParent &&
			getListIndent(previousBlock) >= currentIndent
		) {
			nextIndent = currentIndent + 1;
		}
	}

	if (nextIndent === currentIndent) {
		return false;
	}

	editor.apply(
		[
			{
				type: "set-props",
				blockId: focus.blockId,
				props: { indent: nextIndent },
			},
		],
		{ origin: "user" },
	);
	return {
		selection: collapsedAt(focus.blockId, focus.offset),
	};
}

type EnterAction =
	| { action: "split"; newBlockType: string | undefined }
	| { action: "convert"; newType: string }
	| { action: "lift" }
	| { action: "insert-text"; text: string };

function resolveEnterAction(
	editor: Editor,
	blockId: string,
	inputMode: "richtext" | "code" | "table" | "none",
): EnterAction | null {
	if (inputMode === "code") {
		return { action: "insert-text", text: "\n" };
	}
	if (inputMode !== "richtext") {
		return null;
	}

	const block = editor.getBlock(blockId);
	if (!block) {
		return null;
	}

	const empty = block.length() === 0;
	if (empty && LIST_BLOCK_TYPES.has(block.type)) {
		return { action: "convert", newType: "paragraph" };
	}
	if (empty && CONTAINER_EXIT_TYPES.has(block.type)) {
		return { action: "convert", newType: "paragraph" };
	}
	if (empty && isInsideParentIdContainer(editor, blockId)) {
		return { action: "lift" };
	}
	if (HEADING_TYPES.has(block.type)) {
		return { action: "split", newBlockType: "paragraph" };
	}
	return { action: "split", newBlockType: undefined };
}
