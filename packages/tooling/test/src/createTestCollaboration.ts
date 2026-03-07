import * as Y from "yjs";
import { createTestEditor } from "./createTestEditor.js";
import { populateYDoc } from "./createTestDocument.js";
import type { TestEditorOptions, TestCollaboration } from "./types.js";

export function createTestCollaboration(
  options?: TestEditorOptions,
): TestCollaboration {
  const docA = new Y.Doc();
  const docB = new Y.Doc();

  if (options?.blocks) {
    populateYDoc(docA, options.blocks);
    populateYDoc(docB, options.blocks);
  }

  const editorA = createTestEditor({ ...options, blocks: undefined, doc: docA });
  const editorB = createTestEditor({ ...options, blocks: undefined, doc: docB });

  return {
    editorA,
    editorB,
    sync() {
      const stateA = Y.encodeStateAsUpdate(docA);
      const stateB = Y.encodeStateAsUpdate(docB);
      Y.applyUpdate(docA, stateB);
      Y.applyUpdate(docB, stateA);
    },
  };
}
