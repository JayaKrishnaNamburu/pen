import { useRef, useSyncExternalStore } from "react";
import type { Editor } from "@pen/core";
import {
  EMPTY_TOOLBAR_STATE,
  type ToolbarState,
} from "../context/toolbarContext.js";

export function useToolbar(editor: Editor): ToolbarState {
  const cacheRef = useRef<ToolbarState>(EMPTY_TOOLBAR_STATE);

  return useSyncExternalStore(
    (callback) => {
      const unsubs = [
        editor.on("selectionChange", callback),
        editor.on("documentChange", callback),
      ];
      return () => unsubs.forEach((u) => u());
    },
    () => {
      const next = computeToolbarState(editor);
      if (toolbarStateEqual(cacheRef.current, next)) {
        return cacheRef.current;
      }
      cacheRef.current = next;
      return next;
    },
    () => EMPTY_TOOLBAR_STATE,
  );
}

function computeToolbarState(editor: Editor): ToolbarState {
  const selection = editor.selection;
  if (!selection || selection.type !== "text") {
    return EMPTY_TOOLBAR_STATE;
  }

  const block = editor.getBlock(selection.anchor.blockId);
  const blockType = block?.type ?? null;

  const activeMarks = resolveActiveMarks(editor, selection);

  const registry = editor.schema;
  const canMark = (type: string) => !!registry.resolveInline(type);

  return {
    activeMarks,
    blockType,
    canBold: canMark("bold"),
    canItalic: canMark("italic"),
    canUnderline: canMark("underline"),
    canStrikethrough: canMark("strikethrough"),
    canCode: canMark("code"),
    canLink: canMark("link"),
  };
}

/**
 * Resolve active marks at the current selection by inspecting
 * the Y.Text deltas at the selection range.
 */
function resolveActiveMarks(
  editor: Editor,
  selection: { type: "text"; anchor: { blockId: string; offset: number }; focus: { blockId: string; offset: number } },
): Record<string, unknown> {
  const blockId = selection.anchor.blockId;
  const block = editor.getBlock(blockId);
  if (!block) return {};

  const deltas = block.textDeltas();
  if (deltas.length === 0) return {};

  const from = Math.min(selection.anchor.offset, selection.focus.offset);
  const to = Math.max(selection.anchor.offset, selection.focus.offset);

  // Collapsed cursor — read marks at cursor position
  if (from === to) {
    let offset = 0;
    for (const d of deltas) {
      const len = d.insert.length;
      if (from >= offset && from <= offset + len) {
        return d.attributes ?? {};
      }
      offset += len;
    }
    return {};
  }

  // Range selection — intersect marks present across the entire range
  let offset = 0;
  let firstSegment = true;
  let intersected: Record<string, unknown> = {};

  for (const d of deltas) {
    const len = d.insert.length;
    const segStart = offset;
    const segEnd = offset + len;
    offset += len;

    if (segEnd <= from || segStart >= to) continue;

    const attrs = d.attributes ?? {};
    if (firstSegment) {
      intersected = { ...attrs };
      firstSegment = false;
    } else {
      for (const key of Object.keys(intersected)) {
        if (!(key in attrs)) {
          delete intersected[key];
        }
      }
    }
  }

  return intersected;
}

function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function toolbarStateEqual(a: ToolbarState, b: ToolbarState): boolean {
  return (
    a.blockType === b.blockType &&
    a.canBold === b.canBold &&
    a.canItalic === b.canItalic &&
    a.canUnderline === b.canUnderline &&
    a.canStrikethrough === b.canStrikethrough &&
    a.canCode === b.canCode &&
    a.canLink === b.canLink &&
    shallowEqual(a.activeMarks, b.activeMarks)
  );
}
