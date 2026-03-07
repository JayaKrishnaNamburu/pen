import type { Extension, OpOrigin } from "@pen/types";
import { defineExtension } from "@pen/types";
import { UndoManagerImpl } from "./undoManager.js";

export interface UndoExtensionOptions {
  groupTimeout?: number;
  trackedOrigins?: OpOrigin[];
}

export function undoExtension(
  options?: UndoExtensionOptions,
): Extension {
  let manager: UndoManagerImpl | null = null;

  return defineExtension({
    name: "undo",

    activateClient: async (ctx) => {
      const { adapter, crdtDoc } = ctx.editor.internals;

      const crdtUndo = adapter.createUndoManager(crdtDoc, {
        trackedOrigins: options?.trackedOrigins ?? ["user", "ai"],
        captureTimeout: options?.groupTimeout ?? 1000,
      });

      manager = new UndoManagerImpl(crdtUndo);
      if (options?.groupTimeout !== undefined) {
        manager.setGroupTimeout(options.groupTimeout);
      }

      ctx.editor.internals.setSlot("undo:manager", manager);
    },

    deactivateClient: async () => {
      manager?.destroy();
      manager = null;
    },

    observe: (events) => {
      if (!manager) return;

      for (const event of events) {
        if (event.origin === "user" || event.origin === "ai") {
          manager.resetIdleTimer();
        }
      }

      manager._notifyListeners();
    },
  });
}
