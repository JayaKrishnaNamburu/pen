import type {
  CreateEditorOptions,
  CRDTDocument,
  Editor,
  PenDocument,
  SchemaRegistry,
  BlockHandle,
} from "@pen/types";
import type * as Y from "yjs";

export interface TestBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: string;
  children?: TestBlock[];
}

export interface TestEditorOptions extends Partial<CreateEditorOptions> {
  blocks?: TestBlock[];
  doc?: Y.Doc;
}

export interface TestEditor extends Editor {
  readonly document: PenDocument;
  readonly ydoc: Y.Doc;
  readonly crdtDoc: CRDTDocument;

  getBlock(blockId: string): BlockHandle;
  simulateKeypress(key: string): void;
  simulateTyping(text: string): void;
  normalizeAll(): void;
  markDirty(blockId: string): void;
  normalizeDirty(): void;
}

export interface TestCollaboration {
  editorA: TestEditor;
  editorB: TestEditor;
  sync(): void;
}
