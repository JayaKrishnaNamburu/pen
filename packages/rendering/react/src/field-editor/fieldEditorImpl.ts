import type {
  FieldEditor,
  Editor,
  BlockSchema,
  SelectionState,
  Unsubscribe,
  InputBackend,
} from "@pen/core";
import { editorSelectionToDOM } from "./selectionBridge.js";
import { EditContextBackend } from "./editContextBackend.js";
import { ContentEditableBackend } from "./contenteditableBackend.js";

export class FieldEditorImpl implements FieldEditor {
  private _activeBlockId: string | null = null;
  private _activeBlockIds: string[] = [];
  private _attachedElement: HTMLElement | null = null;
  private _isEditing = false;
  private _selection: SelectionState = null;
  private _inputMode: "richtext" | "code" | "table" | "none" = "richtext";
  private _backend: InputBackend | null = null;
  private _editor: Editor;
  private _rootElement: HTMLElement | null = null;
  private _activateListeners = new Set<(blockIds: string[]) => void>();
  private _deactivateListeners = new Set<(blockIds: string[]) => void>();
  private _selectionListeners = new Set<(sel: SelectionState) => void>();

  constructor(editor: Editor) {
    this._editor = editor;
  }

  get activeBlockId(): string | null {
    return this._activeBlockId;
  }
  get activeBlockIds(): readonly string[] {
    return this._activeBlockIds;
  }
  get isEditing(): boolean {
    return this._isEditing;
  }
  get inputMode(): "richtext" | "code" | "table" | "none" {
    return this._inputMode;
  }
  get selection(): SelectionState | null {
    return this._selection;
  }
  set selection(sel: SelectionState | null) {
    this._selection = sel;
    for (const cb of this._selectionListeners) cb(sel);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  activate(blockId: string): void {
    if (this._activeBlockId === blockId) return;
    if (this._isEditing) this.deactivate();

    const block = this._editor.getBlock(blockId);
    if (!block) return;

    const schema = this._editor.schema.resolve(block.type);
    if (schema?.fieldEditor === "none") return;

    this._activeBlockId = blockId;
    this._activeBlockIds = [blockId];
    this._isEditing = true;

    this._inputMode = resolveInputMode(schema?.fieldEditor);
    this._backend = this.createBackend();
    this._syncActiveElement(false);

    for (const cb of this._activateListeners) cb([blockId]);
  }

  deactivate(): void {
    if (!this._isEditing) return;

    const blockIds = [...this._activeBlockIds];
    this._backend?.deactivate();
    this._backend = null;
    this._attachedElement = null;

    this._activeBlockId = null;
    this._activeBlockIds = [];
    this._isEditing = false;
    this._selection = null;

    for (const cb of this._deactivateListeners) cb(blockIds);
  }

  focus(): void {
    if (!this._isEditing || !this._activeBlockId) return;
    const root = this._findEditorRoot();

    if (!root) return;

    const blockEl = root.querySelector(`[data-block-id="${this._activeBlockId}"]`);
    const inlineEl = blockEl?.querySelector("[data-pen-inline-content]") as HTMLElement | null;

    if (!inlineEl) return;

    inlineEl.focus({ preventScroll: false });

    const selection = root.ownerDocument?.getSelection();
    if (!selection) return;

    const range = root.ownerDocument.createRange();
    range.selectNodeContents(inlineEl);
    range.collapse(false);

    selection.removeAllRanges();
    selection.addRange(range);
  }

  blur(): void {
    const root = this._findEditorRoot();
    if (!root) return;
    const activeEl = root.ownerDocument?.activeElement;
    if (activeEl instanceof HTMLElement && root.contains(activeEl)) {
      activeEl.blur();
    }
  }

  setRootElement(element: HTMLElement | null): void {
    this._rootElement = element;
    if (element && this._isEditing) {
      this._syncActiveElement(false);
    }
  }

  private _findEditorRoot(): HTMLElement | null {
    if (!this._rootElement?.isConnected) return null;
    return this._rootElement;
  }

  attachElement(element: HTMLElement): void {
    if (!this._backend || !this._activeBlockId) return;
    if (this._attachedElement === element) return;
    if (this._attachedElement) {
      this._backend.deactivate();
      this._backend = this.createBackend();
    }

    const adapter = this._editor.internals.adapter;
    const doc = this._editor.internals.crdtDoc;
    const ydoc = adapter.raw(doc) as any;
    const blockMap = ydoc.getMap("blocks").get(this._activeBlockId);
    const ytext = blockMap?.get("content");
    if (!ytext) return;

    this._backend.activate(element, ytext);
    this._attachedElement = element;
  }

  syncTextSelection(
    blockId: string,
    anchorOffset: number,
    focusOffset: number,
  ): void {
    if (!this._isEditing) return;
    if (this._activeBlockId !== blockId) return;

    this.setTextSelection(blockId, anchorOffset, focusOffset);
  }

  setTextSelection(
    blockId: string,
    anchorOffset: number,
    focusOffset: number,
  ): void {
    this._editor.selectText(blockId, anchorOffset, focusOffset);
    this.selection = this._editor.selection;
  }

  activateTextSelection(
    blockId: string,
    anchorOffset: number,
    focusOffset: number,
  ): void {
    this.setTextSelection(blockId, anchorOffset, focusOffset);

    requestAnimationFrame(() => {
      this.activate(blockId);

      requestAnimationFrame(() => {
        const root = this._findEditorRoot();
        if (!root) return;

        editorSelectionToDOM(
          root,
          { blockId, offset: anchorOffset },
          { blockId, offset: focusOffset },
        );
      });
    });
  }

  delegate(blockSchema: BlockSchema): boolean {
    return blockSchema.fieldEditor !== "none";
  }

  // ── Cross-block expansion ────────────────────────────────

  expandTo(blockId: string): void {
    if (!this._isEditing) return;
    if (this._activeBlockIds.includes(blockId)) return;

    const doc = this._editor.documentState;
    const startIdx = doc.indexOf(this._activeBlockIds[0]);
    const endIdx = doc.indexOf(blockId);
    if (startIdx < 0 || endIdx < 0) return;

    const low = Math.min(startIdx, endIdx);
    const high = Math.max(startIdx, endIdx);
    const blockIds: string[] = [];
    for (let i = low; i <= high; i++) {
      const id = doc.blockAt(i);
      if (id) blockIds.push(id);
    }

    this._activeBlockIds = blockIds;
    for (const cb of this._activateListeners) cb(blockIds);
  }

  contractToFocused(): void {
    if (this._activeBlockIds.length <= 1) return;
    const focused = this._activeBlockId;
    if (!focused) return;
    this._activeBlockIds = [focused];
    for (const cb of this._activateListeners) cb([focused]);
  }

  // ── Events ───────────────────────────────────────────────

  onActivate(cb: (blockIds: string[]) => void): Unsubscribe {
    this._activateListeners.add(cb);
    return () => this._activateListeners.delete(cb);
  }

  onDeactivate(cb: (blockIds: string[]) => void): Unsubscribe {
    this._deactivateListeners.add(cb);
    return () => this._deactivateListeners.delete(cb);
  }

  onSelectionChange(cb: (sel: SelectionState) => void): Unsubscribe {
    this._selectionListeners.add(cb);
    return () => this._selectionListeners.delete(cb);
  }

  destroy(): void {
    this.deactivate();
    this._activateListeners.clear();
    this._deactivateListeners.clear();
    this._selectionListeners.clear();
  }

  // ── Internal ─────────────────────────────────────────────

  private createBackend(): InputBackend {
    if ("EditContext" in globalThis) {
      return new EditContextBackend(this._editor, this);
    }
    return new ContentEditableBackend(this._editor, this);
  }

  private _syncActiveElement(focus: boolean): void {
    if (!this._activeBlockId) return;
    const root = this._findEditorRoot();
    if (!root) return;

    const blockEl = root.querySelector(`[data-block-id="${this._activeBlockId}"]`);
    const inlineEl = blockEl?.querySelector("[data-pen-inline-content]") as HTMLElement | null;
    if (!inlineEl) return;

    this.attachElement(inlineEl);
    if (focus) {
      this.focus();
    }
  }
}

function resolveInputMode(
  fieldEditor?: import("@pen/core").FieldEditorType,
): "richtext" | "code" | "table" | "none" {
  if (!fieldEditor || fieldEditor === "richtext" || fieldEditor === "plaintext") return "richtext";
  if (fieldEditor === "code") return "code";
  if (fieldEditor === "table") return "table";
  if (fieldEditor === "none") return "none";
  return "richtext";
}
