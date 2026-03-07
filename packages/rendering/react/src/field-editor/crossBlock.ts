import type { Editor } from "@pen/core";
import type { FieldEditorImpl } from "./fieldEditorImpl.js";

/**
 * Cross-block expansion and contraction.
 *
 * Handles expanding the contenteditable scope across multiple blocks
 * and managing shared Y.Text observation.
 */

export interface CrossBlockState {
  isExpanded: boolean;
  blockIds: readonly string[];
  anchorBlockId: string | null;
}

/**
 * Expand the field editor range from the current block to the target block.
 * Called on shift-click or drag gestures.
 */
export function expandFieldEditorRange(
  fieldEditor: FieldEditorImpl,
  targetBlockId: string,
): void {
  fieldEditor.expandTo(targetBlockId);
}

/**
 * Contract back to a single block (the focused one).
 */
export function contractFieldEditorRange(fieldEditor: FieldEditorImpl): void {
  fieldEditor.contractToFocused();
}

/**
 * Determine whether a block selection should use cross-block contenteditable
 * expansion or switch to BlockSelection mode.
 *
 * Per spec: >50 blocks uses BlockSelection instead of contenteditable expansion.
 */
export function shouldUseBlockSelection(
  editor: Editor,
  blockCount: number,
): boolean {
  return blockCount > 50;
}
