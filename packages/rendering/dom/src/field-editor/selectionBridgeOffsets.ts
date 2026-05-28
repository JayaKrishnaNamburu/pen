import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	findLogicalDOMPoint,
	getInlineAtomPointerOffset,
	getLogicalNodeLength,
} from "./inlineAtomDom";
import { getInlineCaretRectFromOffset } from "./selectionGeometry";
import { queryBlockElement } from "./selectionDomQueries";
import { domPointToOffset, type DirectionalSelectionOffsets, type SelectionPoint } from "./selectionBridge";
function isNodeWithinOrEqual(container: HTMLElement, node: Node): boolean {
	return node === container || container.contains(node);
}

/**
 * Set DOM selection from editor (blockId, offset) pairs.
 */
export function editorSelectionToDOM(
	root: HTMLElement,
	anchor: SelectionPoint,
	focus: SelectionPoint,
): void {
	const anchorResult = findDOMPoint(root, anchor.blockId, anchor.offset);
	const focusResult = findDOMPoint(root, focus.blockId, focus.offset);
	if (!anchorResult || !focusResult) return;

	const sel = window.getSelection();
	if (!sel) return;

	setDOMSelection(sel, anchorResult, focusResult);
}

export function getSelectionPointRect(
	root: HTMLElement,
	point: SelectionPoint,
): DOMRect | null {
	const domPoint = findDOMPoint(root, point.blockId, point.offset);
	if (!domPoint) return null;

	const blockEl = queryBlockElement(root, point.blockId);
	const inlineEl = blockEl?.querySelector(
		`[${DATA_ATTRS.inlineContent}]`,
	) as HTMLElement | null;
	if (!inlineEl) return null;

	const doc = root.ownerDocument;
	if (!doc) return null;

	const range = doc.createRange();
	range.setStart(domPoint.node, domPoint.offset);
	range.collapse(true);

	const rangeRectGetter = (
		range as Range & { getBoundingClientRect?: () => DOMRect }
	).getBoundingClientRect;
	if (typeof rangeRectGetter === "function") {
		const rect = rangeRectGetter.call(range);
		if (rect.height > 0 || rect.width > 0) {
			return rect;
		}
	}

	return getInlineCaretRectFromOffset(inlineEl, point.offset);
}

export function getTextSelectionClientRects(
	root: HTMLElement,
	selection: {
		anchor: SelectionPoint;
		focus: SelectionPoint;
	},
): DOMRect[] {
	const doc = root.ownerDocument;
	if (!doc) {
		return [];
	}

	const anchorPoint = findDOMPoint(
		root,
		selection.anchor.blockId,
		selection.anchor.offset,
	);
	const focusPoint = findDOMPoint(
		root,
		selection.focus.blockId,
		selection.focus.offset,
	);
	if (!anchorPoint || !focusPoint) {
		return [];
	}

	const range = doc.createRange();
	try {
		range.setStart(anchorPoint.node, anchorPoint.offset);
		range.setEnd(focusPoint.node, focusPoint.offset);
	} catch {
		range.setStart(focusPoint.node, focusPoint.offset);
		range.setEnd(anchorPoint.node, anchorPoint.offset);
	}

	const rangeClientRectGetter = (
		range as Range & { getClientRects?: () => DOMRectList | DOMRect[] }
	).getClientRects;
	const clientRects =
		typeof rangeClientRectGetter === "function"
			? Array.from(rangeClientRectGetter.call(range))
			: [];
	if (clientRects.length > 0) {
		return clientRects.filter((rect) => rect.width > 0 || rect.height > 0);
	}

	const rangeRectGetter = (
		range as Range & { getBoundingClientRect?: () => DOMRect }
	).getBoundingClientRect;
	if (typeof rangeRectGetter !== "function") {
		return [];
	}

	const boundingRect = rangeRectGetter.call(range);
	return boundingRect.width > 0 || boundingRect.height > 0
		? [boundingRect]
		: [];
}

/**
 * Find the DOM text node and offset for a given (blockId, characterOffset).
 */
function findDOMPoint(
	root: HTMLElement,
	blockId: string,
	charOffset: number,
): { node: Node; offset: number } | null {
	const blockEl = queryBlockElement(root, blockId);
	if (!blockEl) return null;

	const inlineEl = blockEl.querySelector(
		`[${DATA_ATTRS.inlineContent}]`,
	) as HTMLElement | null;
	if (!inlineEl) return null;

	return findLogicalDOMPoint(inlineEl, charOffset);
}

/**
 * Get the current selection as character offsets within the active inline content.
 * Used by DIRECT_HANDLERS to know the selection range for editing operations.
 */
export function getDirectionalSelectionOffsets(
	inlineElement: HTMLElement,
): DirectionalSelectionOffsets | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	if (!sel.anchorNode || !sel.focusNode) return null;
	if (
		!isNodeWithinOrEqual(inlineElement, sel.anchorNode) ||
		!isNodeWithinOrEqual(inlineElement, sel.focusNode)
	) {
		return null;
	}

	const anchor = domPointToOffset(
		inlineElement,
		sel.anchorNode,
		sel.anchorOffset,
	);
	const focus = domPointToOffset(
		inlineElement,
		sel.focusNode,
		sel.focusOffset,
	);

	return {
		anchor,
		focus,
		start: Math.min(anchor, focus),
		end: Math.max(anchor, focus),
	};
}

export function getSelectionOffsets(
	inlineElement: HTMLElement,
): { start: number; end: number } | null {
	const offsets = getDirectionalSelectionOffsets(inlineElement);
	if (!offsets) return null;

	return { start: offsets.start, end: offsets.end };
}

/**
 * Get the caret offset (collapsed cursor position) within an inline element.
 */
export function getCaretOffset(inlineElement: HTMLElement): number {
	const offsets = getSelectionOffsets(inlineElement);
	return offsets?.start ?? 0;
}

function setDOMSelection(
	selection: Selection,
	anchor: { node: Node; offset: number },
	focus: { node: Node; offset: number },
): void {
	selection.removeAllRanges();

	const setBaseAndExtent = (
		selection as Selection & {
			setBaseAndExtent?: (
				anchorNode: Node,
				anchorOffset: number,
				focusNode: Node,
				focusOffset: number,
			) => void;
		}
	).setBaseAndExtent;
	if (typeof setBaseAndExtent === "function") {
		try {
			setBaseAndExtent.call(
				selection,
				anchor.node,
				anchor.offset,
				focus.node,
				focus.offset,
			);
			return;
		} catch {
			// Fall back to the range-based path in test environments like jsdom.
		}
	}

	const collapseRange = document.createRange();
	collapseRange.setStart(anchor.node, anchor.offset);
	collapseRange.collapse(true);
	selection.addRange(collapseRange);

	if (
		(anchor.node !== focus.node || anchor.offset !== focus.offset) &&
		typeof selection.extend === "function"
	) {
		selection.extend(focus.node, focus.offset);
		return;
	}

	selection.removeAllRanges();
	const orderedRange = document.createRange();
	if (compareDOMPoints(anchor, focus) <= 0) {
		orderedRange.setStart(anchor.node, anchor.offset);
		orderedRange.setEnd(focus.node, focus.offset);
	} else {
		orderedRange.setStart(focus.node, focus.offset);
		orderedRange.setEnd(anchor.node, anchor.offset);
	}
	selection.addRange(orderedRange);
}

function compareDOMPoints(
	left: { node: Node; offset: number },
	right: { node: Node; offset: number },
): number {
	if (left.node === right.node) {
		return left.offset - right.offset;
	}

	const leftRange = document.createRange();
	leftRange.setStart(left.node, left.offset);
	leftRange.collapse(true);

	const rightRange = document.createRange();
	rightRange.setStart(right.node, right.offset);
	rightRange.collapse(true);

	return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange);
}
