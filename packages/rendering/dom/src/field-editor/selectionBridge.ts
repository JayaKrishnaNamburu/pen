/**
 * DOM↔CRDT selection mapping utilities.
 * Converts between browser selection ranges and (blockId, offset) pairs.
 */

import { DATA_ATTRS } from "../utils/dataAttributes";
import {
	getBlockSelectionRoleFromType,
	getSelectionLengthForRole,
} from "../utils/blockSelectionSemantics";
import {
	domPointToLogicalOffset,
	findLogicalDOMPoint,
	getLogicalNodeLength,
	isInlineAtomNode,
} from "./inlineAtomDom";
import {
	approximateInlineOffsetFromPoint,
	getDistanceToRect,
	getInlineCaretRectFromOffset,
} from "./selectionGeometry";
import {
	findBlockElement,
	findInlineContentElement,
	queryBlockElement,
	queryInlineElement,
} from "./selectionDomQueries";
export {
	findBlockElement,
	findInlineContentElement,
	queryBlockElement,
	queryInlineElement,
} from "./selectionDomQueries";
export {
	computeTextDiff,
	extractTextFromDOM,
	type TextDiffOp,
} from "./textDiff";

export interface SelectionPoint {
	blockId: string;
	offset: number;
}

export type SelectionBoundary = "start" | "end";

export interface DirectionalSelectionOffsets {
	anchor: number;
	focus: number;
	start: number;
	end: number;
}

function isNodeWithinOrEqual(container: HTMLElement, node: Node): boolean {
	return node === container || container.contains(node);
}

interface CaretPositionLike {
	offsetNode: Node;
	offset: number;
}

interface ResolveSelectionPointOptions {
	preferredBoundary?: SelectionBoundary;
	previousPoint?: SelectionPoint | null;
}

function fallbackCharacterOffset(
	container: HTMLElement,
	targetNode: Node,
	targetOffset: number,
): number {
	return domPointToLogicalOffset(container, targetNode, targetOffset);
}

/**
 * Compute the character offset of a DOM point within an inline content container.
 * Uses DOM Range first so browser-native endpoints on mark wrapper elements map
 * to the same logical offsets as equivalent text-node endpoints.
 */
export function domPointToOffset(
	container: HTMLElement,
	targetNode: Node,
	targetOffset: number,
): number {
	if (targetNode !== container && !container.contains(targetNode)) {
		return fallbackCharacterOffset(container, targetNode, targetOffset);
	}

	return domPointToLogicalOffset(container, targetNode, targetOffset);
}

function getBlockSurfaceRole(
	blockEl: HTMLElement,
): "editable-inline" | "structural" | "delegated" {
	const role = blockEl.getAttribute(DATA_ATTRS.surfaceRole);
	if (role === "structural" || role === "delegated") {
		return role;
	}

	return getBlockSelectionRoleFromType(
		blockEl.getAttribute(DATA_ATTRS.blockType),
	);
}

function getBlockTextLength(blockEl: HTMLElement): number {
	const inlineEl = findInlineContentElement(blockEl);
	if (inlineEl) {
		return getLogicalNodeLength(inlineEl);
	}
	return blockEl.textContent?.length ?? 0;
}

function getBlockSelectionLength(blockEl: HTMLElement): number {
	return getSelectionLengthForRole(
		getBlockSurfaceRole(blockEl),
		getBlockTextLength(blockEl),
	);
}

function getBoundaryOffset(
	blockEl: HTMLElement,
	side: SelectionBoundary,
): number {
	return side === "start" ? 0 : getBlockSelectionLength(blockEl);
}

function resolveBoundarySideFromOffset(
	currentOffset: number,
	maxOffset: number,
): SelectionBoundary {
	if (currentOffset <= 0) return "start";
	if (currentOffset >= maxOffset) return "end";
	return currentOffset <= maxOffset / 2 ? "start" : "end";
}

function resolveBoundarySideFromPointer(
	blockEl: HTMLElement,
	clientX: number,
	clientY: number,
): SelectionBoundary {
	const rect = blockEl.getBoundingClientRect();
	const verticalDelta = clientY - (rect.top + rect.height / 2);
	if (Math.abs(verticalDelta) > 4) {
		return verticalDelta < 0 ? "start" : "end";
	}
	return clientX <= rect.left + rect.width / 2 ? "start" : "end";
}

function getBoundaryPointForBlockElement(
	blockEl: HTMLElement,
	side: SelectionBoundary,
): SelectionPoint | null {
	const blockId = blockEl.getAttribute("data-block-id");
	if (!blockId) return null;
	return {
		blockId,
		offset: getBoundaryOffset(blockEl, side),
	};
}

export function getClosestBlockElementFromPoint(
	root: HTMLElement,
	clientX: number,
	clientY: number,
): HTMLElement | null {
	const doc = root.ownerDocument;
	const hitElement =
		typeof doc.elementFromPoint === "function"
			? doc.elementFromPoint(clientX, clientY)
			: null;
	const hitBlockEl = hitElement?.closest(
		`[${DATA_ATTRS.editorBlock}]`,
	) as HTMLElement | null;
	if (hitBlockEl && root.contains(hitBlockEl)) {
		return hitBlockEl;
	}

	const blockElements = root.querySelectorAll(`[${DATA_ATTRS.editorBlock}]`);
	let closestBlockEl: HTMLElement | null = null;
	let bestScore = Number.POSITIVE_INFINITY;

	for (const blockElement of blockElements) {
		if (!(blockElement instanceof HTMLElement)) continue;
		const rect = blockElement.getBoundingClientRect();
		const { dx, dy } = getDistanceToRect(rect, clientX, clientY);
		const score = dy * 1000 + dx;
		if (score < bestScore) {
			bestScore = score;
			closestBlockEl = blockElement;
		}
	}

	return closestBlockEl;
}

export function getBlockBoundaryPoint(
	root: HTMLElement,
	blockId: string,
	side: SelectionBoundary,
): SelectionPoint | null {
	const blockEl = queryBlockElement(root, blockId);
	if (!blockEl) return null;
	return getBoundaryPointForBlockElement(blockEl, side);
}

export function getSelectionPointForBlockAtPointer(
	blockEl: HTMLElement,
	clientX: number,
	clientY: number,
	options: ResolveSelectionPointOptions = {},
): SelectionPoint | null {
	const blockId = blockEl.getAttribute("data-block-id");
	if (!blockId) return null;

	const surfaceRole = getBlockSurfaceRole(blockEl);
	if (surfaceRole !== "editable-inline") {
		return getBoundaryPointForBlockElement(
			blockEl,
			options.preferredBoundary ??
				resolveBoundarySideFromPointer(blockEl, clientX, clientY),
		);
	}

	const inlineEl = findInlineContentElement(blockEl);
	if (!inlineEl) {
		return { blockId, offset: 0 };
	}

	return {
		blockId,
		offset: approximateInlineOffsetFromPoint(
			inlineEl,
			clientX,
			clientY,
			options.previousPoint?.blockId === blockId
				? options.previousPoint.offset
				: null,
		),
	};
}

/**
 * Resolve a DOM selection point (node + offset within that node) into
 * a (blockId, characterOffset) pair relative to the editor root.
 */
function resolveSelectionPoint(
	root: HTMLElement,
	node: Node,
	offset: number,
	options: ResolveSelectionPointOptions = {},
): SelectionPoint | null {
	const blockEl = findBlockElement(node, root);
	if (!blockEl) return null;
	const blockId = blockEl.getAttribute("data-block-id");
	if (!blockId) return null;

	const surfaceRole = getBlockSurfaceRole(blockEl);
	if (surfaceRole !== "editable-inline") {
		const inlineEl = findInlineContentElement(blockEl);
		const snappedSide =
			options.preferredBoundary ??
			(inlineEl && inlineEl.contains(node)
				? resolveBoundarySideFromOffset(
						domPointToOffset(inlineEl, node, offset),
						getBlockSelectionLength(blockEl),
					)
				: "start");
		return getBoundaryPointForBlockElement(blockEl, snappedSide);
	}

	const inlineEl = findInlineContentElement(blockEl);
	if (!inlineEl) return { blockId, offset: 0 };

	if (!inlineEl.contains(node)) return { blockId, offset: 0 };

	const charOffset = domPointToOffset(inlineEl, node, offset);
	return { blockId, offset: charOffset };
}

export function pointToEditorSelectionPoint(
	root: HTMLElement,
	clientX: number,
	clientY: number,
	options: ResolveSelectionPointOptions = {},
): SelectionPoint | null {
	const doc = root.ownerDocument;
	if (!doc) return null;
	const atomPoint = resolveInlineAtomPoint(root, clientX, clientY, options);
	if (atomPoint) return atomPoint;
	const caretFromPoint = doc as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => CaretPositionLike | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};

	const position = caretFromPoint.caretPositionFromPoint?.(clientX, clientY);
	if (position) {
		const inlineBoundaryPoint = resolveInlineContainerBoundaryPoint(
			root,
			position.offsetNode,
			position.offset,
			clientX,
			clientY,
			options,
		);
		if (inlineBoundaryPoint) return inlineBoundaryPoint;

		const resolved = resolveSelectionPoint(
			root,
			position.offsetNode,
			position.offset,
			options,
		);
		if (resolved) return resolved;
	}

	const range = caretFromPoint.caretRangeFromPoint?.(clientX, clientY);
	if (range) {
		const inlineBoundaryPoint = resolveInlineContainerBoundaryPoint(
			root,
			range.startContainer,
			range.startOffset,
			clientX,
			clientY,
			options,
		);
		if (inlineBoundaryPoint) return inlineBoundaryPoint;

		const resolved = resolveSelectionPoint(
			root,
			range.startContainer,
			range.startOffset,
			options,
		);
		if (resolved) return resolved;
	}

	const hoveredBlockEl = getClosestBlockElementFromPoint(
		root,
		clientX,
		clientY,
	);
	if (!hoveredBlockEl) return null;
	return getSelectionPointForBlockAtPointer(
		hoveredBlockEl,
		clientX,
		clientY,
		options,
	);
}

function resolveInlineAtomPoint(
	root: HTMLElement,
	clientX: number,
	clientY: number,
	options: ResolveSelectionPointOptions,
): SelectionPoint | null {
	const hitElement =
		typeof root.ownerDocument.elementFromPoint === "function"
			? root.ownerDocument.elementFromPoint(clientX, clientY)
			: null;
	if (!hitElement || !root.contains(hitElement)) {
		return null;
	}

	const atomElement = findInlineAtomElement(hitElement, root);
	if (!atomElement) {
		return null;
	}

	const blockEl = findBlockElement(atomElement, root);
	if (!blockEl || getBlockSurfaceRole(blockEl) !== "editable-inline") {
		return null;
	}

	return getSelectionPointForBlockAtPointer(
		blockEl,
		clientX,
		clientY,
		options,
	);
}

function findInlineAtomElement(
	element: Element,
	root: HTMLElement,
): HTMLElement | null {
	let current: Element | null = element;
	while (current && current !== root) {
		if (isInlineAtomNode(current)) {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

function resolveInlineContainerBoundaryPoint(
	root: HTMLElement,
	node: Node,
	offset: number,
	clientX: number,
	clientY: number,
	options: ResolveSelectionPointOptions,
): SelectionPoint | null {
	const blockEl = findBlockElement(node, root);
	if (!blockEl || getBlockSurfaceRole(blockEl) !== "editable-inline") {
		return null;
	}

	const inlineEl = findInlineContentElement(blockEl);
	if (!inlineEl || !isInlineBoundaryFallbackPoint(inlineEl, node, offset)) {
		return null;
	}

	const geometricPoint = getSelectionPointForBlockAtPointer(
		blockEl,
		clientX,
		clientY,
		options,
	);
	return geometricPoint && geometricPoint.offset > 0 ? geometricPoint : null;
}

function isInlineBoundaryFallbackPoint(
	inlineEl: HTMLElement,
	node: Node,
	offset: number,
): boolean {
	if (node === inlineEl) {
		return offset === 0;
	}

	return node instanceof HTMLElement && node.contains(inlineEl);
}

/**
 * Convert DOM selection range to editor (blockId, offset) pairs.
 */
export function domSelectionToEditor(
	root: HTMLElement,
): { anchor: SelectionPoint; focus: SelectionPoint } | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;

	const anchorNode = sel.anchorNode;
	const focusNode = sel.focusNode;
	if (!anchorNode || !focusNode) return null;
	if (!root.contains(anchorNode) || !root.contains(focusNode)) return null;

	const anchor = resolveSelectionPoint(root, anchorNode, sel.anchorOffset);
	const focus = resolveSelectionPoint(root, focusNode, sel.focusOffset);
	if (!anchor || !focus) return null;

	return { anchor, focus };
}

export {
	editorSelectionToDOM,
	getCaretOffset,
	getDirectionalSelectionOffsets,
	getSelectionOffsets,
	getSelectionPointRect,
	getTextSelectionClientRects,
} from "./selectionBridgeOffsets";
