import type { Extension, FieldEditor, OpOrigin, SelectionState } from "@pen/types";
import { defineExtension, FIELD_EDITOR_SLOT_KEY } from "@pen/types";
import { UndoManagerImpl } from "./undoManager.js";

export interface UndoExtensionOptions {
  groupTimeout?: number;
  trackedOrigins?: OpOrigin[];
}

export function undoExtension(
  options?: UndoExtensionOptions,
): Extension {
  let manager: UndoManagerImpl | null = null;
  let unsubscribeStackItemAdded: (() => void) | null = null;
  let unsubscribeStackItemPopped: (() => void) | null = null;
  let pendingSelectionRestore: StoredSelection | undefined;
  let selectionRestoreQueued = false;
  const trackedOrigins = options?.trackedOrigins ?? DEFAULT_TRACKED_ORIGINS;

  return defineExtension({
    name: "undo",

    activateClient: async (ctx) => {
      const { adapter, crdtDoc } = ctx.editor.internals;

      const crdtUndo = adapter.createUndoManager(crdtDoc, {
        trackedOrigins,
        captureTimeout: options?.groupTimeout ?? 1000,
      });

      unsubscribeStackItemAdded = crdtUndo.onStackItemAdded?.((stackItem) => {
        stackItem.setMeta(SELECTION_META_KEY, captureSelection(ctx.editor.selection));
      }) ?? null;
      unsubscribeStackItemPopped = crdtUndo.onStackItemPopped?.((stackItem) => {
        pendingSelectionRestore = stackItem.getMeta<StoredSelection>(SELECTION_META_KEY);
        if (selectionRestoreQueued) return;

        selectionRestoreQueued = true;
        queueMicrotask(() => {
          selectionRestoreQueued = false;
          const selection = pendingSelectionRestore;
          pendingSelectionRestore = undefined;
          restoreSelection(ctx.editor, selection);
        });
      }) ?? null;

      manager = new UndoManagerImpl(crdtUndo);
      if (options?.groupTimeout !== undefined) {
        manager.setGroupTimeout(options.groupTimeout);
      }

      ctx.editor.internals.setSlot("undo:manager", manager);
    },

    deactivateClient: async () => {
      pendingSelectionRestore = undefined;
      selectionRestoreQueued = false;
      unsubscribeStackItemAdded?.();
      unsubscribeStackItemAdded = null;
      unsubscribeStackItemPopped?.();
      unsubscribeStackItemPopped = null;
      manager?.destroy();
      manager = null;
    },

    observe: (events) => {
      if (!manager) return;

      for (const event of events) {
        if (trackedOrigins.includes(event.origin)) {
          manager.resetIdleTimer();
        }
      }

      manager._notifyListeners();
    },
  });
}

const DEFAULT_TRACKED_ORIGINS: OpOrigin[] = ["user", "ai", "import"];
const SELECTION_META_KEY = "pen:selection";

type StoredSelection =
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

function captureSelection(selection: SelectionState): StoredSelection {
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
  }

  return null;
}

function restoreSelection(
  editor: {
    selection: SelectionState;
    setSelection(selection: SelectionState): void;
    selectBlocks(blockIds: string[]): void;
    selectTextRange(
      anchor: { blockId: string; offset: number },
      focus: { blockId: string; offset: number },
    ): void;
    internals: {
      getSlot<T>(key: string): T | undefined;
    };
  },
  selection: StoredSelection | undefined,
): void {
  if (selection === undefined) return;

  if (selection === null) {
    editor.setSelection(null);
    return;
  }

  if (selection.type === "text") {
    const fieldEditor =
      editor.internals.getSlot<FieldEditor>(FIELD_EDITOR_SLOT_KEY) ?? null;
    if (
      selection.anchor.blockId === selection.focus.blockId &&
      typeof fieldEditor?.activateTextSelection === "function"
    ) {
      fieldEditor.activateTextSelection(
        selection.focus.blockId,
        selection.anchor.offset,
        selection.focus.offset,
      );
      return;
    }

    editor.selectTextRange(selection.anchor, selection.focus);
    return;
  }

  if (selection.type === "block") {
    editor.selectBlocks(selection.blockIds);
    return;
  }

  editor.setSelection(selection);
}
