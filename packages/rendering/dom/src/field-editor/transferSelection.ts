import type { Editor, Position } from "@input/pen-types";

export interface TransferCursorContext {
	blockId: string;
	offset: number;
	blockType: string;
	isInline: boolean;
	isEmpty: boolean;
}

export type TransferSelectionSnapshot =
	| {
			type: "text";
			anchor: { blockId: string; offset: number };
			focus: { blockId: string; offset: number };
	  }
	| {
			type: "block";
			blockIds: string[];
	  }
	| {
			type: "app";
			appId: string;
	  }
	| {
			type: "cell";
			blockId: string;
			anchor: { row: number; col: number };
			head: { row: number; col: number };
	  }
	| null;

export function getTransferCursorContext(
	editor: Editor,
): TransferCursorContext | null {
	const selection = editor.selection;
	if (selection?.type !== "text") return null;

	const blockId = selection.anchor.blockId;
	const block = editor.getBlock(blockId);
	if (!block) return null;

	const schema = editor.schema.resolve(block.type);
	const textContent = block.textContent?.() ?? "";
	return {
		blockId,
		offset: selection.anchor.offset,
		blockType: block.type,
		isInline: schema?.content === "inline",
		isEmpty:
			schema?.content === "inline" &&
			textContent.length === 0 &&
			selection.anchor.offset === 0,
	};
}

export function snapshotTransferSelection(
	editor: Editor,
): TransferSelectionSnapshot {
	const selection = editor.selection;
	if (!selection) return null;

	switch (selection.type) {
		case "text":
			return {
				type: "text",
				anchor: { ...selection.anchor },
				focus: { ...selection.focus },
			};
		case "block":
			return {
				type: "block",
				blockIds: [...selection.blockIds],
			};
		case "app":
			return {
				type: "app",
				appId: selection.appId,
			};
		case "cell":
			return {
				type: "cell",
				blockId: selection.blockId,
				anchor: { ...selection.anchor },
				head: { ...selection.head },
			};
		default:
			return null;
	}
}

export function selectionSnapshotMatches(
	editor: Editor,
	snapshot: TransferSelectionSnapshot,
): boolean {
	return areTransferSelectionSnapshotsEqual(
		snapshotTransferSelection(editor),
		snapshot,
	);
}

function areTransferSelectionSnapshotsEqual(
	left: TransferSelectionSnapshot,
	right: TransferSelectionSnapshot,
): boolean {
	if (left === right) {
		return true;
	}
	if (!left || !right) {
		return left === right;
	}
	if (left.type !== right.type) {
		return false;
	}

	switch (left.type) {
		case "text":
			return (
				right.type === "text" &&
				textPointsEqual(left.anchor, right.anchor) &&
				textPointsEqual(left.focus, right.focus)
			);
		case "block":
			return (
				right.type === "block" &&
				stringArraysEqual(left.blockIds, right.blockIds)
			);
		case "app":
			return right.type === "app" && left.appId === right.appId;
		case "cell":
			return (
				right.type === "cell" &&
				left.blockId === right.blockId &&
				cellPointsEqual(left.anchor, right.anchor) &&
				cellPointsEqual(left.head, right.head)
			);
		default: {
			const _exhaustive: never = left;
			return _exhaustive;
		}
	}
}

function textPointsEqual(
	left: { blockId: string; offset: number },
	right: { blockId: string; offset: number },
): boolean {
	return left.blockId === right.blockId && left.offset === right.offset;
}

function cellPointsEqual(
	left: { row: number; col: number },
	right: { row: number; col: number },
): boolean {
	return left.row === right.row && left.col === right.col;
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
	if (left.length !== right.length) {
		return false;
	}
	for (let index = 0; index < left.length; index += 1) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

export function deleteSelectionForTransfer(
	editor: Editor,
	cursorBefore: TransferCursorContext | null,
): {
	cursorAfter: TransferCursorContext | null;
	position: Position | undefined;
	emptyBlockToRemove: string | undefined;
} {
	editor.deleteSelection();

	const cursorAfter = getTransferCursorContext(editor) ?? cursorBefore;
	const shouldReplace = cursorAfter?.isEmpty;
	return {
		cursorAfter,
		position: cursorAfter
			? shouldReplace
				? { before: cursorAfter.blockId }
				: { after: cursorAfter.blockId }
			: undefined,
		emptyBlockToRemove: shouldReplace ? cursorAfter.blockId : undefined,
	};
}
