import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_UNDO_MAX_DEPTH } from "../undoExtension";
import { UndoManagerImpl } from "../undoManager";

function createCrdtUndo() {
  return {
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    canUndo: vi.fn(() => true),
    canRedo: vi.fn(() => false),
    stopCapturing: vi.fn(),
    setCaptureTimeout: vi.fn(),
    addTrackedOrigin: vi.fn(),
    removeTrackedOrigin: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("@input/pen-undo UndoManagerImpl", () => {
  it("delegates undo/redo operations to the CRDT undo manager", () => {
    const crdtUndo = createCrdtUndo();

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
    const crdtUndo = createCrdtUndo();

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
    const crdtUndo = createCrdtUndo();

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
    const crdtUndo = createCrdtUndo();

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

  it("H.6/CH7 default max-depth cap is 500", () => {
    expect(DEFAULT_UNDO_MAX_DEPTH).toBe(500);
  });

  it("DUR4: default tracked origins do not include migration", () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../undoExtension.ts"),
      "utf8",
    );
    const start = source.indexOf("const DEFAULT_TRACKED_ORIGINS");
    const end = source.indexOf("];", start);
    const defaults = source.slice(start, end + 2);

    expect(defaults).toContain('"user"');
    expect(defaults).not.toContain("migration");
  });

  it("CH5: reports a thrown stack listener through onListenerError", () => {
    const crdtUndo = createCrdtUndo();
    const errors: unknown[] = [];
    const manager = new UndoManagerImpl(crdtUndo, undefined, {
      onListenerError(error) {
        errors.push(error);
      },
    });

    manager.onStackChange(() => {
      throw new Error("listener-boom");
    });
    manager.stopCapturing();

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect((errors[0] as Error).message).toBe("listener-boom");
  });

  it("CH7 destroy() tears down the CRDT undo manager", () => {
    const crdtUndo = createCrdtUndo();
    const manager = new UndoManagerImpl(crdtUndo);

    manager.destroy();

    expect(crdtUndo.destroy).toHaveBeenCalledTimes(1);
  });
});
