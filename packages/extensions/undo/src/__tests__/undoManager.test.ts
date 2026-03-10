import { describe, expect, it, vi } from "vitest";

import { UndoManagerImpl } from "../undoManager";

describe("@pen/undo UndoManagerImpl", () => {
  it("delegates undo/redo operations to the CRDT undo manager", () => {
    const crdtUndo = {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => false),
      stopCapturing: vi.fn(),
    };

    const manager = new UndoManagerImpl(crdtUndo);

    expect(manager.undo()).toBe(true);
    expect(manager.redo()).toBe(true);
    expect(manager.canUndo()).toBe(true);
    expect(manager.canRedo()).toBe(false);
    manager.stopCapturing();

    expect(crdtUndo.undo).toHaveBeenCalled();
    expect(crdtUndo.redo).toHaveBeenCalled();
    expect(crdtUndo.stopCapturing).toHaveBeenCalled();
  });
});
