import type { CRDTUndoManager, UndoManagerOptions } from "@pen/types";
import * as Y from "yjs";

import type { YjsCRDTDocument } from "./document.js";

export function createYjsUndoManager(
  doc: YjsCRDTDocument,
  options?: UndoManagerOptions,
): CRDTUndoManager {
  const { blockOrder, blocks } = doc.penDocument;
  const trackedOrigins = new Set<string>(
    options?.trackedOrigins ?? ["user", "ai"],
  );

  const undoManager = new Y.UndoManager([blockOrder, blocks], {
    trackedOrigins,
    captureTimeout: options?.captureTimeout ?? 0,
    doc: doc.ydoc,
  });

  return {
    undo() {
      if (undoManager.undoStack.length === 0) return false;
      undoManager.undo();
      return true;
    },
    redo() {
      if (undoManager.redoStack.length === 0) return false;
      undoManager.redo();
      return true;
    },
    canUndo() {
      return undoManager.undoStack.length > 0;
    },
    canRedo() {
      return undoManager.redoStack.length > 0;
    },
    stopCapturing() {
      undoManager.stopCapturing();
    },
  };
}
