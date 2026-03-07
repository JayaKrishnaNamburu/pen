/**
 * DOM↔CRDT selection mapping utilities.
 * Converts between browser selection ranges and (blockId, offset) pairs.
 */

import { DATA_ATTRS } from "../utils/dataAttributes.js";

export type TextDiffOp =
	| { type: "insert"; offset: number; text: string }
	| { type: "delete"; offset: number; length: number };

/**
 * O(n) scan from both ends to find the changed region.
 * Returns delete + insert ops for the diff.
 */
export function computeTextDiff(
	oldText: string,
	newText: string,
): TextDiffOp[] {
	if (oldText === newText) return [];

	let prefixLen = 0;
	const minLen = Math.min(oldText.length, newText.length);
	while (prefixLen < minLen && oldText[prefixLen] === newText[prefixLen]) {
		prefixLen++;
	}

	let oldSuffix = oldText.length;
	let newSuffix = newText.length;
	while (
		oldSuffix > prefixLen &&
		newSuffix > prefixLen &&
		oldText[oldSuffix - 1] === newText[newSuffix - 1]
	) {
		oldSuffix--;
		newSuffix--;
	}

	const ops: TextDiffOp[] = [];

	const deleteLen = oldSuffix - prefixLen;
	if (deleteLen > 0) {
		ops.push({ type: "delete", offset: prefixLen, length: deleteLen });
	}

	const insertText = newText.slice(prefixLen, newSuffix);
	if (insertText.length > 0) {
		ops.push({ type: "insert", offset: prefixLen, text: insertText });
	}

	return ops;
}

export function extractTextFromDOM(element: HTMLElement): string {
	return element.textContent ?? "";
}

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

interface CaretPositionLike {
	offsetNode: Node;
	offset: number;
}

interface ResolveSelectionPointOptions {
	preferredBoundary?: SelectionBoundary;
}

function fallbackCharacterOffset(
	container: HTMLElement,
	targetNode: Node,
	targetOffset: number,
): number {
	let charOffset = 0;

	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT,
		null,
	);

	let textNode: Text | null;
	while ((textNode = walker.nextNode() as Text | null)) {
		if (textNode === targetNode) {
			return charOffset + Math.min(targetOffset, textNode.length);
		}
		charOffset += textNode.textContent?.length ?? 0;
	}

	if (targetNode === container) {
		let counted = 0;
		for (
			let i = 0;
			i < targetOffset && i < container.childNodes.length;
			i++
		) {
			counted += container.childNodes[i].textContent?.length ?? 0;
		}
		return counted;
	}

	return charOffset;
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

	try {
		const range = container.ownerDocument.createRange();
		range.setStart(container, 0);
		range.setEnd(targetNode, targetOffset);
		return range.toString().length;
	} catch {
		return fallbackCharacterOffset(container, targetNode, targetOffset);
	}
}

/**
 * Find the ancestor block element for a given DOM node.
 */
function findBlockElement(node: Node, root: HTMLElement): HTMLElement | null {
	let current: Node | null = node;
	while (current && current !== root) {
		if (
			current instanceof HTMLElement &&
			current.hasAttribute(DATA_ATTRS.editorBlock)
		) {
			return current;
		}
		current = current.parentNode;
	}
	return null;
}

/**
 * Find the inline content element inside a block.
 */
function findInlineContentElement(blockEl: HTMLElement): HTMLElement | null {
	return blockEl.querySelector(`[${DATA_ATTRS.inlineContent}]`);
}

function getBlockSurfaceRole(
	blockEl: HTMLElement,
): "editable-inline" | "structural" | "delegated" {
	const role = blockEl.getAttribute(DATA_ATTRS.surfaceRole);
	if (role === "structural" || role === "delegated") {
		return role;
	}

	const blockType = blockEl.getAttribute("data-block-type");
	if (blockType === "divider" || blockType === "image") {
		return "structural";
	}
	if (blockType === "codeBlock" || blockType === "table") {
		return "delegated";
	}

	return "editable-inline";
}

function getBlockTextLength(blockEl: HTMLElement): number {
	const inlineEl = findInlineContentElement(blockEl);
	if (inlineEl) {
		return inlineEl.textContent?.length ?? 0;
	}
	return blockEl.textContent?.length ?? 0;
}

function getBoundaryOffset(
	blockEl: HTMLElement,
	side: SelectionBoundary,
): number {
	return side === "start" ? 0 : getBlockTextLength(blockEl);
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

export function getBlockBoundaryPoint(
	root: HTMLElement,
	blockId: string,
	side: SelectionBoundary,
): SelectionPoint | null {
	const blockEl = root.querySelector(
		`[data-block-id="${blockId}"]`,
	) as HTMLElement | null;
	if (!blockEl) return null;
	return getBoundaryPointForBlockElement(blockEl, side);
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
						getBlockTextLength(blockEl),
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

	const caretFromPoint = doc as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => CaretPositionLike | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};

	const position = caretFromPoint.caretPositionFromPoint?.(clientX, clientY);
	if (position) {
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
		const resolved = resolveSelectionPoint(
			root,
			range.startContainer,
			range.startOffset,
			options,
		);
		if (resolved) return resolved;
	}

	const hitElement =
		typeof doc.elementFromPoint === "function"
			? doc.elementFromPoint(clientX, clientY)
			: null;
	if (!hitElement) return null;

	const blockEl = hitElement.closest(
		`[${DATA_ATTRS.editorBlock}]`,
	) as HTMLElement | null;
	if (!blockEl) return null;

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

	const textLength = inlineEl.textContent?.length ?? 0;
	const inlineRect = inlineEl.getBoundingClientRect();
	const offset =
		clientX <= inlineRect.left + inlineRect.width / 2 ? 0 : textLength;

	return { blockId, offset };
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

/**
 * Find the DOM text node and offset for a given (blockId, characterOffset).
 */
function findDOMPoint(
	root: HTMLElement,
	blockId: string,
	charOffset: number,
): { node: Node; offset: number } | null {
	const blockEl = root.querySelector(`[data-block-id="${blockId}"]`);
	if (!blockEl) return null;

	const inlineEl = blockEl.querySelector(`[${DATA_ATTRS.inlineContent}]`);
	if (!inlineEl) return null;

	const walker = document.createTreeWalker(
		inlineEl,
		NodeFilter.SHOW_TEXT,
		null,
	);

	let remaining = charOffset;
	let textNode: Text | null;
	while ((textNode = walker.nextNode() as Text | null)) {
		const len = textNode.textContent?.length ?? 0;
		if (remaining <= len) {
			return { node: textNode, offset: remaining };
		}
		remaining -= len;
	}

	// Past end — position at end of last text node or container
	const lastText = inlineEl.lastChild;
	if (lastText) {
		return {
			node: lastText,
			offset: lastText.textContent?.length ?? 0,
		};
	}
	return { node: inlineEl, offset: 0 };
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
		!inlineElement.contains(sel.anchorNode) ||
		!inlineElement.contains(sel.focusNode)
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
