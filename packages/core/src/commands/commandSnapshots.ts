import type { BlockHandle, Editor, SelectionState } from "@input/pen-types";

import type {
	NormalPositionBlock,
	NormalPositionSnapshot,
} from "../selection/normalPosition";
import type {
	TransitionBlock,
	TransitionContainerKind,
	TransitionSnapshot,
	SelectionState as TransitionSelection,
} from "../selection/transitions";
import {
	getRootBlockIds,
	isEditableTextBlock,
	LIST_BLOCK_TYPES,
	logicalInline,
	PARENT_ID_CONTAINER_TYPES,
} from "./commandBlockContext";
import {
	blockSelectionResult,
	textSelectionResult,
} from "./commandSelection";

/**
 * Captures a {@link NormalPositionSnapshot} from an editor's current document.
 *
 * Exported so renderers can feed `snapToNormalPosition` without building a second
 * adapter over the document shape; two snapshot builders would drift apart and the
 * snap rule would disagree with core about where a caret may legally sit.
 *
 * @param editor - The editor to read block order and block content from.
 * @returns A snapshot detached from the live document.
 */
export function buildNormalPositionSnapshot(
	editor: Editor,
): NormalPositionSnapshot {
	const blockOrder = [...editor.documentState.blockOrder];
	const blocks: Record<string, NormalPositionBlock> = {};
	for (const blockId of blockOrder) {
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}
		if (!isEditableTextBlock(editor, blockId)) {
			blocks[blockId] = { kind: "structural", text: "" };
			continue;
		}
		const logical = logicalInline(block);
		blocks[blockId] = {
			kind: "text",
			text: logical.text,
			atoms: logical.atoms,
		};
	}
	return { blockOrder, blocks };
}

export function buildTransitionSnapshot(editor: Editor): TransitionSnapshot {
	const blockOrder = [...editor.documentState.blockOrder];
	const blocks: Record<string, TransitionBlock> = {};
	for (const blockId of blockOrder) {
		const block = editor.getBlock(blockId);
		if (!block) {
			continue;
		}
		const parentId = editor.documentState.parentOf(blockId);
		const listContainer = listContainerFor(editor, block);
		blocks[blockId] = {
			id: blockId,
			kind: isEditableTextBlock(editor, blockId) ? "text" : "structural",
			length: block.length(),
			parentId,
			containerId: listContainer?.id ?? parentId,
			containerKind: listContainer?.kind ?? parentContainerKind(editor, parentId),
		};
	}
	return {
		blockOrder,
		topLevelIds: getRootBlockIds(editor),
		blocks,
	};
}

export function toTransitionSelection(
	editor: Editor,
): TransitionSelection {
	const selection = editor.selection;
	if (!selection) {
		return null;
	}
	switch (selection.type) {
		case "text":
			return {
				type: "text",
				anchor: selection.anchor,
				focus: selection.focus,
				affinity: selection.affinity ?? "downstream",
				goalX: selection.goalX ?? null,
			};
		case "block":
			return {
				type: "block",
				blockIds: selection.blockIds,
				head:
					selection.head ??
					selection.blockIds[selection.blockIds.length - 1] ??
					selection.blockIds[0] ??
					"",
			};
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: selection.anchor,
				head: selection.head,
			};
		case "app":
			return { type: "app", appId: selection.appId };
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

export function fromTransitionSelection(
	selection: TransitionSelection,
	blockOrder?: readonly string[],
): SelectionState | null {
	if (!selection) {
		return null;
	}
	switch (selection.type) {
		case "text":
			return textSelectionResult(selection.anchor, selection.focus, {
				affinity: selection.affinity,
				goalX: selection.goalX,
				blockOrder,
			});
		case "block":
			return blockSelectionResult(selection.blockIds, selection.head);
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: selection.anchor,
				head: selection.head,
			};
		case "app":
			return { type: "app", appId: selection.appId };
		default: {
			const _exhaustive: never = selection;
			return _exhaustive;
		}
	}
}

function listContainerFor(
	editor: Editor,
	block: BlockHandle,
): { id: string; kind: TransitionContainerKind } | null {
	if (!LIST_BLOCK_TYPES.has(block.type)) {
		return null;
	}
	const parentId = editor.documentState.parentOf(block.id) ?? "root";
	return {
		id: `list:${parentId}:${block.type}`,
		kind: "list",
	};
}

function parentContainerKind(
	editor: Editor,
	parentId: string | null,
): TransitionContainerKind | null {
	if (!parentId) {
		return null;
	}
	const parent = editor.getBlock(parentId);
	if (!parent) {
		return null;
	}
	if (PARENT_ID_CONTAINER_TYPES.has(parent.type)) {
		return "layout-cell";
	}
	if (parent.type === "table") {
		return "table";
	}
	return null;
}
