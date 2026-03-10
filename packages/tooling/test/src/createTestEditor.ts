import * as Y from "yjs";
import { defaultSchema } from "@pen/schema-default";
import { createEditor } from "@pen/core";
import { yjsAdapter, wrapYjsDocument } from "@pen/crdt-yjs";
import { createTestDocument } from "./createTestDocument";
import type { TestEditor, TestEditorOptions } from "./types";
import { simulateKeypress, simulateTyping } from "./simulation";

export function createTestEditor(options?: TestEditorOptions): TestEditor {
  const schema = options?.schema ?? defaultSchema;
  const adapter = yjsAdapter();

  let ydoc: Y.Doc;
  let doc: ReturnType<typeof wrapYjsDocument>["penDocument"];
  let crdtDoc: ReturnType<typeof wrapYjsDocument>;

  if (options?.doc) {
    ydoc = options.doc;
    const wrapped = wrapYjsDocument(adapter, ydoc);
    doc = wrapped.penDocument;
    crdtDoc = wrapped;
  } else {
    const result = createTestDocument(options?.blocks ?? []);
    ydoc = result.ydoc;
    doc = result.doc as any;
    crdtDoc = result.crdtDoc as any;
  }

  const editor = createEditor({
    schema,
    crdt: adapter,
  });
  editor.loadDocument(crdtDoc);

  const testEditor = editor as TestEditor;
  const getBlock = editor.getBlock.bind(editor);

  Object.defineProperties(testEditor, {
    document: {
      get() {
        return editor.internals.doc;
      },
    },
    ydoc: {
      get() {
        return adapter.raw<Y.Doc>(editor.internals.crdtDoc);
      },
    },
    crdtDoc: {
      get() {
        return editor.internals.crdtDoc;
      },
    },
  });

  testEditor.markDirty = (blockId: string) => {
    (editor.internals.engine as unknown as { markDirty(id: string): void }).markDirty(
      blockId,
    );
  };
  testEditor.normalizeDirty = () => {
    (
      editor.internals.engine as unknown as {
        normalizeDirty(): void;
      }
    ).normalizeDirty();
  };
  testEditor.getBlock = (blockId: string) => {
    const handle = getBlock(blockId);
    if (!handle) {
      throw new Error(`Block not found: ${blockId}`);
    }
    return handle;
  };
  testEditor.simulateKeypress = (key: string) => {
    simulateKeypress(testEditor, key);
  };
  testEditor.simulateTyping = (text: string) => {
    simulateTyping(testEditor, text);
  };

  return testEditor;
}
