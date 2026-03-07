import type {
  SelectionState,
  PenDocument,
  CRDTDocument,
  CRDTMap,
  SchemaRegistry,
  BlockHandle,
} from "@pen/types";
import { createBlockHandle } from "../schema/handles.js";
import { EventEmitter } from "./events.js";
import { DocumentRangeImpl } from "./range.js";

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

export class SelectionManagerImpl {
  private _selection: SelectionState = null;
  private _doc: PenDocument;
  private _crdtDoc: CRDTDocument;
  private readonly _registry: SchemaRegistry;
  private readonly _emitter: EventEmitter;

  constructor(
    doc: PenDocument,
    crdtDoc: CRDTDocument,
    registry: SchemaRegistry,
    emitter: EventEmitter,
  ) {
    this._doc = doc;
    this._crdtDoc = crdtDoc;
    this._registry = registry;
    this._emitter = emitter;
  }

  getSelection(): SelectionState {
    return this._selection;
  }

  setSelection(selection: SelectionState): void {
    if (selection && !this._validateSelection(selection)) return;
    const prev = this._selection;
    this._selection = selection;
    if (prev !== selection) {
      this._emitter.emit("selectionChange", selection);
    }
  }

  selectBlock(blockId: string): void {
    if (!this._blockExists(blockId)) return;
    this.setSelection({ type: "block", blockIds: [blockId] });
  }

  selectBlocks(blockIds: string[]): void {
    const valid = blockIds.filter((id) => this._blockExists(id));
    if (valid.length === 0) return;
    this.setSelection({ type: "block", blockIds: valid });
  }

  selectText(blockId: string, from: number, to: number): void {
    if (!this._blockExists(blockId)) return;

    const blockMap = (this._doc.blocks as CRDTBlockMap).get(blockId);
    const content = blockMap?.get("content") as
      | { length: number }
      | undefined;
    if (!content || typeof content.length !== "number") return;

    const len = content.length;
    const clampedFrom = Math.max(0, Math.min(from, len));
    const clampedTo = Math.max(clampedFrom, Math.min(to, len));

    this.setSelection({
      type: "text",
      anchor: { blockId, offset: clampedFrom },
      focus: { blockId, offset: clampedTo },
      isCollapsed: clampedFrom === clampedTo,
      isMultiBlock: false,
      blockRange: [blockId],
      toRange: () =>
        new DocumentRangeImpl(
          { blockId, offset: clampedFrom },
          { blockId, offset: clampedTo },
          this._doc,
        ),
    });
  }

  selectAll(): void {
    const ids: string[] = [];
    for (let i = 0; i < this._doc.blockOrder.length; i++) {
      ids.push(this._doc.blockOrder.get(i) as string);
    }
    if (ids.length > 0) {
      this.setSelection({ type: "block", blockIds: ids });
    }
  }

  getSelectedText(): string {
    const sel = this._selection;
    if (!sel) return "";

    if (sel.type === "text") {
      const blockMap = (this._doc.blocks as CRDTBlockMap).get(
        sel.anchor.blockId,
      );
      const content = blockMap?.get("content") as
        | { toString(): string }
        | undefined;
      if (!content || typeof content.toString !== "function") return "";
      const full = content.toString();
      const from = Math.min(sel.anchor.offset, sel.focus.offset);
      const to = Math.max(sel.anchor.offset, sel.focus.offset);
      return full.slice(from, to);
    }

    if (sel.type === "block") {
      const parts: string[] = [];
      for (const id of sel.blockIds) {
        const handle = createBlockHandle(
          id,
          this._doc,
          this._crdtDoc,
          this._registry,
        );
        parts.push(handle.textContent());
      }
      return parts.join("\n");
    }

    return "";
  }

  getSelectedBlocks(): BlockHandle[] {
    const sel = this._selection;
    if (!sel) return [];

    if (sel.type === "block") {
      return sel.blockIds
        .filter((id) => this._blockExists(id))
        .map((id) =>
          createBlockHandle(
            id,
            this._doc,
            this._crdtDoc,
            this._registry,
          ),
        );
    }

    if (sel.type === "text") {
      if (this._blockExists(sel.anchor.blockId)) {
        return [
          createBlockHandle(
            sel.anchor.blockId,
            this._doc,
            this._crdtDoc,
            this._registry,
          ),
        ];
      }
    }

    return [];
  }

  updateDocument(doc: PenDocument, crdtDoc: CRDTDocument): void {
    this._doc = doc;
    this._crdtDoc = crdtDoc;
    this._selection = null;
  }

  private _validateSelection(sel: SelectionState): boolean {
    if (!sel) return true;
    if (sel.type === "text") return this._blockExists(sel.anchor.blockId);
    if (sel.type === "block")
      return sel.blockIds.every((id) => this._blockExists(id));
    if (sel.type === "app") return true;
    if (sel.type === "cell") return this._blockExists(sel.blockId);
    return false;
  }

  private _blockExists(blockId: string): boolean {
    return (this._doc.blocks as CRDTBlockMap).has(blockId);
  }
}
