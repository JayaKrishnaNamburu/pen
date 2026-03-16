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
      setCaptureTimeout: vi.fn(),
      addTrackedOrigin: vi.fn(),
      removeTrackedOrigin: vi.fn(),
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

  it("registers tracked origins idempotently", () => {
    const crdtUndo = {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => true),
      stopCapturing: vi.fn(),
      setCaptureTimeout: vi.fn(),
      addTrackedOrigin: vi.fn(),
      removeTrackedOrigin: vi.fn(),
    };

    const manager = new UndoManagerImpl(crdtUndo);
    const unregister = manager.registerTrackedOrigins(["ai"]);

    expect(manager.hasTrackedOrigin("ai")).toBe(true);
    expect(crdtUndo.addTrackedOrigin).toHaveBeenCalledTimes(1);

    unregister();
    unregister();

    expect(manager.hasTrackedOrigin("ai")).toBe(false);
    expect(crdtUndo.removeTrackedOrigin).toHaveBeenCalledTimes(1);
  });

  it("keeps shared tracked origins registered until all owners release them", () => {
    const crdtUndo = {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => true),
      stopCapturing: vi.fn(),
      setCaptureTimeout: vi.fn(),
      addTrackedOrigin: vi.fn(),
      removeTrackedOrigin: vi.fn(),
    };

    const manager = new UndoManagerImpl(crdtUndo);
    const unregisterA = manager.registerTrackedOrigins(["ai"]);
    const unregisterB = manager.registerTrackedOrigins(["ai"]);

    expect(crdtUndo.addTrackedOrigin).toHaveBeenCalledTimes(1);

    unregisterA();
    expect(manager.hasTrackedOrigin("ai")).toBe(true);
    expect(crdtUndo.removeTrackedOrigin).not.toHaveBeenCalled();

    unregisterB();
    expect(manager.hasTrackedOrigin("ai")).toBe(false);
    expect(crdtUndo.removeTrackedOrigin).toHaveBeenCalledTimes(1);
  });

  it("notifies capture boundary listeners when explicit undo groups change", () => {
    const crdtUndo = {
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      canUndo: vi.fn(() => true),
      canRedo: vi.fn(() => true),
      stopCapturing: vi.fn(),
      setCaptureTimeout: vi.fn(),
      addTrackedOrigin: vi.fn(),
      removeTrackedOrigin: vi.fn(),
    };

    const manager = new UndoManagerImpl(crdtUndo);
    const onCaptureBoundary = vi.fn();
    manager._onCaptureBoundary = onCaptureBoundary;

    manager.syncExplicitUndoGroup("group-a");
    manager.syncExplicitUndoGroup("group-a");
    manager.syncExplicitUndoGroup("group-b");
    manager.syncExplicitUndoGroup(null);

    expect(onCaptureBoundary).toHaveBeenCalledTimes(3);
    expect(crdtUndo.stopCapturing).toHaveBeenCalledTimes(3);
    expect(crdtUndo.setCaptureTimeout).toHaveBeenNthCalledWith(
      1,
      2_147_483_647,
    );
    expect(crdtUndo.setCaptureTimeout).toHaveBeenNthCalledWith(
      2,
      2_147_483_647,
    );
    expect(crdtUndo.setCaptureTimeout).toHaveBeenNthCalledWith(3, 1000);
  });
});
