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

/**
 * Walk a DOM container to compute the character offset of a (node, nodeOffset) pair.
 * Traverses text nodes and element wrappers (mark spans) to count characters.
 */
function computeCharacterOffset(
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
      return charOffset + targetOffset;
    }
    charOffset += textNode.textContent?.length ?? 0;
  }

  // targetNode might be an element — count all preceding text
  if (targetNode === container) {
    let counted = 0;
    for (let i = 0; i < targetOffset && i < container.childNodes.length; i++) {
      counted += container.childNodes[i].textContent?.length ?? 0;
    }
    return counted;
  }

  return charOffset;
}

/**
 * Find the ancestor block element for a given DOM node.
 */
function findBlockElement(
  node: Node,
  root: HTMLElement,
): HTMLElement | null {
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
function findInlineContentElement(
  blockEl: HTMLElement,
): HTMLElement | null {
  return blockEl.querySelector(`[${DATA_ATTRS.inlineContent}]`);
}

/**
 * Resolve a DOM selection point (node + offset within that node) into
 * a (blockId, characterOffset) pair relative to the editor root.
 */
function resolveSelectionPoint(
  root: HTMLElement,
  node: Node,
  offset: number,
): SelectionPoint | null {
  const blockEl = findBlockElement(node, root);
  if (!blockEl) return null;

  const blockId = blockEl.getAttribute("data-block-id");
  if (!blockId) return null;

  const inlineEl = findInlineContentElement(blockEl);
  if (!inlineEl) return { blockId, offset: 0 };

  if (!inlineEl.contains(node)) return { blockId, offset: 0 };

  const charOffset = computeCharacterOffset(inlineEl, node, offset);
  return { blockId, offset: charOffset };
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

  sel.removeAllRanges();
  const range = document.createRange();
  range.setStart(anchorResult.node, anchorResult.offset);
  range.setEnd(focusResult.node, focusResult.offset);
  sel.addRange(range);
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
export function getSelectionOffsets(
  inlineElement: HTMLElement,
): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;

  const range = sel.getRangeAt(0);
  if (!inlineElement.contains(range.startContainer)) return null;

  const start = computeCharacterOffset(
    inlineElement,
    range.startContainer,
    range.startOffset,
  );
  const end = computeCharacterOffset(
    inlineElement,
    range.endContainer,
    range.endOffset,
  );

  return { start: Math.min(start, end), end: Math.max(start, end) };
}

/**
 * Get the caret offset (collapsed cursor position) within an inline element.
 */
export function getCaretOffset(inlineElement: HTMLElement): number {
  const offsets = getSelectionOffsets(inlineElement);
  return offsets?.start ?? 0;
}
