import type {
  Editor,
  Block,
  CreateEditorOptions,
  SchemaRegistry,
  SelectionState,
} from "@pen/core";

// ── Test Editor ─────────────────────────────────────────────

export interface TestEditorOptions extends CreateEditorOptions {
  doc?: Block[];
}

export function createTestEditor(_options?: TestEditorOptions): Editor {
  throw new Error("Not implemented");
}

// ── Test Document ───────────────────────────────────────────

export interface TestBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: string;
  children?: TestBlock[];
}

export function createTestDocument(_blocks: TestBlock[]): unknown {
  throw new Error("Not implemented");
}

// ── Assertions ──────────────────────────────────────────────

export function assertDocEquals(
  _editorOrA: Editor,
  _expectedOrB: TestBlock[] | Editor,
): void {
  throw new Error("Not implemented");
}

// ── Collaboration Testing ───────────────────────────────────

export interface TestCollaboration {
  editorA: Editor;
  editorB: Editor;
  sync(): void;
}

export function createTestCollaboration(
  _options?: CreateEditorOptions,
): TestCollaboration {
  throw new Error("Not implemented");
}
