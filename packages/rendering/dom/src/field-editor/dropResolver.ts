import type { Editor, Position } from "@input/pen-types";
import { measureWithRoot } from "../geometry/rootGeometry";
import type { GeometryReader, Rect } from "../geometry/types";
import {
	getClosestBlockElementFromPoint,
	getSelectionPointForBlockAtPointer,
	pointToEditorSelectionPoint,
	type SelectionPoint,
} from "./selectionBridge";

export type ResolvedDropTarget =
	| {
			kind: "inline";
			point: SelectionPoint;
	  }
	| {
			kind: "block-edge";
			blockId: string;
			side: "before" | "after";
			position: Position;
	  }
	| {
			kind: "document-end";
			position: Position;
	  };

export type DropPreview =
	| {
			kind: "inline-caret";
			point: SelectionPoint;
	  }
	| {
			kind: "block-edge";
			blockId: string;
			side: "before" | "after";
	  }
	| null;

export interface ResolveDropTargetOptions {
	previousTarget?: ResolvedDropTarget | null;
}

export function resolveDropTarget(
	editor: Editor,
	root: HTMLElement,
	clientX: number,
	clientY: number,
	options: ResolveDropTargetOptions = {},
): ResolvedDropTarget | null {
	return measureWithRoot(root, ({ reader }) =>
		resolveDropTargetFromReader(
			editor,
			root,
			reader,
			clientX,
			clientY,
			options,
		),
	);
}

function resolveDropTargetFromReader(
	editor: Editor,
	root: HTMLElement,
	reader: GeometryReader,
	clientX: number,
	clientY: number,
	options: ResolveDropTargetOptions,
): ResolvedDropTarget | null {
	const hoveredBlockEl = getClosestBlockElementFromPoint(
		root,
		clientX,
		clientY,
	);
	const hoveredBlockId =
		hoveredBlockEl?.getAttribute("data-block-id") ?? null;
	if (hoveredBlockEl && hoveredBlockId) {
		const hoveredRect = reader.blockRect(hoveredBlockId);
		if (hoveredRect && !pointWithinRect(clientX, clientY, hoveredRect)) {
			const side =
				clientY <= hoveredRect.top + hoveredRect.height / 2
					? "before"
					: "after";
			return {
				kind: "block-edge",
				blockId: hoveredBlockId,
				side,
				position:
					side === "before"
						? { before: hoveredBlockId }
						: { after: hoveredBlockId },
			};
		}
	}

	const previousPoint =
		options.previousTarget?.kind === "inline"
			? options.previousTarget.point
			: null;
	let point = pointToEditorSelectionPoint(root, clientX, clientY, {
		previousPoint,
	});
	if (hoveredBlockEl) {
		if (hoveredBlockId && (!point || point.blockId !== hoveredBlockId)) {
			point = getSelectionPointForBlockAtPointer(
				hoveredBlockEl,
				clientX,
				clientY,
				{ previousPoint },
			);
		}
	}

	if (point) {
		const block = editor.getBlock(point.blockId);
		const schema = block ? editor.schema.resolve(block.type) : null;
		if (schema?.content === "inline") {
			return {
				kind: "inline",
				point,
			};
		}

		const rect = reader.blockRect(point.blockId);
		if (rect) {
			const side =
				clientY <= rect.top + rect.height / 2 ? "before" : "after";
			return {
				kind: "block-edge",
				blockId: point.blockId,
				side,
				position:
					side === "before"
						? { before: point.blockId }
						: { after: point.blockId },
			};
		}

		return {
			kind: "inline",
			point,
		};
	}

	const lastBlock = editor.lastBlock();
	if (!lastBlock) {
		return {
			kind: "document-end",
			position: "last",
		};
	}

	return {
		kind: "block-edge",
		blockId: lastBlock.id,
		side: "after",
		position: { after: lastBlock.id },
	};
}

function pointWithinRect(
	clientX: number,
	clientY: number,
	rect: Rect,
): boolean {
	return (
		clientX >= rect.left &&
		clientX <= rect.right &&
		clientY >= rect.top &&
		clientY <= rect.bottom
	);
}

export function getDropPreview(target: ResolvedDropTarget | null): DropPreview {
	if (!target) return null;

	if (target.kind === "inline") {
		return {
			kind: "inline-caret",
			point: target.point,
		};
	}

	if (target.kind === "document-end") return null;

	return {
		kind: "block-edge",
		blockId: target.blockId,
		side: target.side,
	};
}
