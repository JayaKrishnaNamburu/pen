import type { Editor, MoveBlockOp } from "@input/pen-types";
import type React from "react";
import { measureWithRoot } from "@input/pen-dom";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import {
	BLOCK_DRAG_MIME,
	parseBlockDragPayload,
	type BlockDropPosition,
} from "./blockDragSession";
import type { InlineAtomDragSnapshot } from "@input/pen-dom";

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

	return readInlineDropCaretStyle(rootElement, snapshot.target!);
}

export function readInlineDropCaretStyle(
	rootElement: HTMLElement,
	point: { blockId: string; offset: number },
): InlineDropCaretStyle | null {
	return measureWithRoot(rootElement, ({ reader }) => {
		const caretRect = reader.caretRect(point, "downstream");
		if (!caretRect) {
			return null;
		}
		return {
			left: caretRect.left,
			top: caretRect.top,
			height: Math.max(caretRect.height, 18),
		};
	});
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
	const rootElement =
		(args.blocksHost.closest(
			`[${DATA_ATTRS.editorRoot}]`,
		) as HTMLElement | null) ?? args.blocksHost;
	const draggedBlockIdSet = new Set(args.draggedBlockIds);

	return measureWithRoot(rootElement, ({ reader }) => {
		const candidateRects = args.blockIds
			.filter((blockId) => !draggedBlockIdSet.has(blockId))
			.flatMap((blockId) => {
				const rect = reader.blockRect(blockId);
				return rect ? [{ blockId, rect }] : [];
			});

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
			const isWithinBlock =
				args.clientY >= rect.top && args.clientY <= rect.bottom;
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
	});
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
