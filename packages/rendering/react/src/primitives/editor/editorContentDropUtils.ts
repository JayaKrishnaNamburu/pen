import type { Editor, MoveBlockOp } from "@pen/types";
import type React from "react";
import { getSelectionPointRect } from "../../field-editor/selectionBridge";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { BLOCK_DRAG_MIME, parseBlockDragPayload, type BlockDropPosition } from "./blockDragSession";
import type { InlineAtomDragSnapshot } from "./inlineAtomInteraction";

export interface InlineDropCaretStyle {
	left: number;
	top: number;
	height: number;
}

export function createInlineDropCaretStyle(
	caret: InlineDropCaretStyle,
): React.CSSProperties {
	return {
		position: "fixed",
		left: `${caret.left}px`,
		top: `${caret.top}px`,
		height: `${caret.height}px`,
		width: "var(--pen-drop-caret-width, 1px)",
		marginLeft: "var(--pen-drop-caret-offset, -0.5px)",
		background:
			"var(--pen-drop-caret-color, var(--pen-caret-color, currentColor))",
		borderRadius: "var(--pen-drop-caret-radius, 999px)",
		boxShadow: "var(--pen-drop-caret-shadow, none)",
		pointerEvents: "none",
		zIndex: 20,
	};
}

export function getInlineAtomDropCaretStyle(args: {
	editor: Editor;
	contentElement: HTMLElement | null;
	snapshot: InlineAtomDragSnapshot;
}): InlineDropCaretStyle | null {
	const { contentElement, editor, snapshot } = args;
	if (
		!snapshot.dragging ||
		snapshot.target?.editor !== editor ||
		!contentElement
	) {
		return null;
	}

	const rootElement = contentElement.closest(
		`[${DATA_ATTRS.editorRoot}]`,
	) as HTMLElement | null;
	if (!rootElement) {
		return null;
	}

	const caretRect = getSelectionPointRect(rootElement, snapshot.target!);
	if (!caretRect) {
		return null;
	}

	return {
		left: caretRect.left,
		top: caretRect.top,
		height: Math.max(caretRect.height, 18),
	};
}
export function resolveDraggedBlockIdsFromEvent(
	dataTransfer: DataTransfer | null,
	viewId: string,
	sessionBlockIds: readonly string[] | null,
): readonly string[] | null {
	const dragTypes = dataTransfer ? Array.from(dataTransfer.types ?? []) : [];
	if (dragTypes.includes(BLOCK_DRAG_MIME)) {
		const payload = parseBlockDragPayload(
			dataTransfer?.getData(BLOCK_DRAG_MIME) ?? "",
		);
		if (payload?.viewId === viewId) {
			return payload.blockIds;
		}
	}

	return sessionBlockIds;
}

export function resolveBlockDropTarget(args: {
	blockIds: readonly string[];
	blocksHost: HTMLElement;
	draggedBlockIds: readonly string[];
	clientY: number;
}): { blockId: string; position: BlockDropPosition } | null {
	const draggedBlockIdSet = new Set(args.draggedBlockIds);
	const candidateRects = args.blockIds
		.filter((blockId) => !draggedBlockIdSet.has(blockId))
		.map((blockId) => {
			const element = args.blocksHost.querySelector(
				`[${DATA_ATTRS.editorBlock}][${DATA_ATTRS.blockId}="${blockId}"]`,
			) as HTMLElement | null;
			if (!element) {
				return null;
			}
			return {
				blockId,
				rect: element.getBoundingClientRect(),
			};
		})
		.filter(
			(
				candidate,
			): candidate is { blockId: string; rect: DOMRect } => candidate !== null,
		);

	if (candidateRects.length === 0) {
		return null;
	}

	let bestTarget: {
		blockId: string;
		position: BlockDropPosition;
		distance: number;
	} | null = null;

	for (const candidate of candidateRects) {
		const { rect } = candidate;
		const isWithinBlock = args.clientY >= rect.top && args.clientY <= rect.bottom;
		const beforeDistance = Math.abs(args.clientY - rect.top);
		const afterDistance = Math.abs(args.clientY - rect.bottom);
		const position =
			isWithinBlock && args.clientY <= rect.top + rect.height / 2
				? "before"
				: isWithinBlock && args.clientY > rect.top + rect.height / 2
					? "after"
					: beforeDistance <= afterDistance
						? "before"
						: "after";
		const distance =
			position === "before" ? beforeDistance : afterDistance;

		if (!bestTarget || distance < bestTarget.distance) {
			bestTarget = {
				blockId: candidate.blockId,
				position,
				distance,
			};
		}
	}

	return bestTarget
		? { blockId: bestTarget.blockId, position: bestTarget.position }
		: null;
}

export function isNoOpBlockMove(
	blockOrder: readonly string[],
	moveOps: readonly MoveBlockOp[],
): boolean {
	const initialOrder = [...blockOrder];
	const nextOrder = [...blockOrder];

	for (const op of moveOps) {
		const currentIndex = nextOrder.indexOf(op.blockId);
		if (currentIndex < 0) {
			continue;
		}
		nextOrder.splice(currentIndex, 1);

		const { position } = op;
		if (typeof position === "object" && "before" in position) {
			const targetIndex = nextOrder.indexOf(position.before);
			if (targetIndex < 0) {
				nextOrder.push(op.blockId);
			} else {
				nextOrder.splice(targetIndex, 0, op.blockId);
			}
			continue;
		}

		if (typeof position !== "object" || !("after" in position)) {
			continue;
		}

		const targetIndex = nextOrder.indexOf(position.after);
		if (targetIndex < 0) {
			nextOrder.push(op.blockId);
		} else {
			nextOrder.splice(targetIndex + 1, 0, op.blockId);
		}
	}

	return initialOrder.join("\u0000") === nextOrder.join("\u0000");
}
