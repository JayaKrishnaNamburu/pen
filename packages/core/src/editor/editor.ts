import type {
  Editor,
  EditorInternals,
  CreateEditorOptions,
  PenEventMap,
  CRDTAdapter,
  CRDTDocument,
  CRDTEvent,
  PenDocument,
  SchemaRegistry,
  Awareness,
  Extension,
  DocumentOp,
  ApplyOptions,
  SelectionState,
  BlockHandle,
  Block,
  DocumentState,
  UndoManager,
  Unsubscribe,
  CRDTMap,
  CRDTArray,
  Position,
  DecorationSet,
} from "@pen/types";
import { yjsAdapter } from "@pen/crdt-yjs";
import { undoExtension } from "@pen/undo";
import { documentOpsExtension } from "@pen/document-ops";
import { deltaStreamExtension } from "@pen/delta-stream";
import { builtInDefaultSchema } from "../defaultSchema.js";
import { SchemaEngineImpl } from "../schema/normalize.js";
import { createBlockHandle } from "../schema/handles.js";
import { EventEmitter } from "./events.js";
import { ApplyPipeline } from "./apply.js";
import { ExtensionManagerImpl } from "./extensionManager.js";
import { SelectionManagerImpl } from "./selection.js";
import { DocumentStateImpl } from "./documentState.js";
import { DocumentRangeImpl } from "./range.js";

type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

// Stub undo manager for when @pen/undo is excluded
const NOOP_UNDO: UndoManager = {
  undo: () => false,
  redo: () => false,
  canUndo: () => false,
  canRedo: () => false,
  stopCapturing: () => { },
  setGroupTimeout: () => { },
  setTrackedOrigins: () => { },
  onStackChange: () => () => { },
};

class EditorImpl implements Editor {
  private readonly _adapter: CRDTAdapter;
  private readonly _registry: SchemaRegistry;
  private _engine: SchemaEngineImpl;
  private readonly _extensions: ExtensionManagerImpl;
  private _selection: SelectionManagerImpl;
  private readonly _emitter: EventEmitter;
  private _pipeline: ApplyPipeline;
  private _documentState: DocumentStateImpl;
  private _doc: PenDocument;
  private _crdtDoc: CRDTDocument;
  private _unsubObserve: Unsubscribe | null = null;
  private _awareness: Awareness | null = null;
  private readonly _slots = new Map<string, unknown>();
  private _clientId: number;

  readonly undoManager: UndoManager;

  constructor(options: CreateEditorOptions = {}) {
    this._registry = options.schema ?? builtInDefaultSchema;
    this._adapter = options.crdt ?? yjsAdapter();
    this._crdtDoc = this._adapter.createDocument();
    this._doc = this._createPenDocument(this._crdtDoc);
    this._clientId = this._adapter.getClientId(this._crdtDoc);

    this._emitter = new EventEmitter();
    this._engine = new SchemaEngineImpl(
      this._registry,
      this._doc,
      this._crdtDoc,
    );
    this._selection = new SelectionManagerImpl(
      this._doc,
      this._crdtDoc,
      this._registry,
      this._emitter,
    );
    this._pipeline = new ApplyPipeline(
      this._doc,
      this._crdtDoc,
      this._adapter,
      this._registry,
      this._engine,
      this._emitter,
      this._selection,
    );
    this._documentState = new DocumentStateImpl(
      this._doc,
      this._crdtDoc,
      this._registry,
    );

    this._extensions = new ExtensionManagerImpl(this._emitter);
    const allExtensions = this._resolveExtensions(options);
    for (const ext of allExtensions) {
      this._extensions.register(ext);
    }

    this._pipeline._init(this, this._extensions, (affectedBlocks) => {
      this._documentState.incrementalUpdate(affectedBlocks);
    });

    this.undoManager = NOOP_UNDO;
    this._refreshCoreSlots();

    if (this._adapter.createAwareness) {
      this._awareness = this._adapter.createAwareness(this._crdtDoc);
    }

    this._wireObservation();
    this._activateExtensions();
    this._ensureInitialParagraph();

    this._engine.normalizeAll();
  }

  // ── Public API ───────────────────────────────────────────

  get clientId(): number {
    return this._clientId;
  }

  get schema(): SchemaRegistry {
    return this._registry;
  }

  get selection(): SelectionState {
    return this._selection.getSelection();
  }

  get documentState(): DocumentState {
    return this._documentState;
  }

  get internals(): EditorInternals {
    return {
      adapter: this._adapter,
      crdtDoc: this._crdtDoc,
      doc: this._doc,
      engine: this._engine,
      awareness: this._awareness,
      getSlot: <T>(key: string): T | undefined =>
        this._slots.get(key) as T | undefined,
      setSlot: (key: string, value: unknown): void => {
        this._slots.set(key, value);
      },
    };
  }

  // ── Mutations ────────────────────────────────────────────

  apply(ops: DocumentOp[], options?: ApplyOptions): void {
    const origin = options?.origin ?? "user";

    if (options?.undoGroup) {
      const undo = this._slots.get("undo:manager") as
        | UndoManager
        | undefined;
      undo?.stopCapturing();
    }

    this._pipeline.apply(ops, origin);
  }

  loadDocument(doc: CRDTDocument): void {
    void this._extensions.deactivateAll(this);
    this._teardownObservation();
    this._crdtDoc = doc;
    this._doc = this._createPenDocument(doc);
    this._clientId = this._adapter.getClientId(this._crdtDoc);
    this._awareness?.destroy();
    this._awareness = this._adapter.createAwareness
      ? this._adapter.createAwareness(this._crdtDoc)
      : null;

    this._engine = new SchemaEngineImpl(
      this._registry,
      this._doc,
      this._crdtDoc,
    );
    this._selection.updateDocument(this._doc, this._crdtDoc);
    this._pipeline.updateDocument(this._doc, this._crdtDoc, this._engine);
    this._documentState.updateDocument(
      this._doc,
      this._crdtDoc,
    );
    this._pipeline._init(this, this._extensions, (affectedBlocks) => {
      this._documentState.incrementalUpdate(affectedBlocks);
    });
    this._refreshCoreSlots();

    this._wireObservation();
    this._activateExtensions();
    this._engine.normalizeAll();
  }

  onBeforeApply(
    hook: (
      ops: DocumentOp[],
      options: ApplyOptions,
    ) => DocumentOp[],
    options?: { priority?: number },
  ): Unsubscribe {
    return this._pipeline.addBeforeApplyHook(
      hook,
      options?.priority ?? 500,
    );
  }

  // ── Block Traversal ──────────────────────────────────────

  *blocks(type?: string): Iterable<BlockHandle> {
    for (let i = 0; i < this._doc.blockOrder.length; i++) {
      const id = (this._doc.blockOrder as CRDTArray<string>).get(
        i,
      ) as string;
      if (type) {
        const blockMap = (this._doc.blocks as CRDTBlockMap).get(id);
        if (!blockMap || blockMap.get("type") !== type) continue;
      }
      yield createBlockHandle(
        id,
        this._doc,
        this._crdtDoc,
        this._registry,
      );
    }
  }

  getBlock(blockId: string): BlockHandle | null {
    if (!(this._doc.blocks as CRDTBlockMap).has(blockId)) return null;
    return createBlockHandle(
      blockId,
      this._doc,
      this._crdtDoc,
      this._registry,
    );
  }

  firstBlock(): BlockHandle | null {
    if (this._doc.blockOrder.length === 0) return null;
    const id = (this._doc.blockOrder as CRDTArray<string>).get(
      0,
    ) as string;
    return createBlockHandle(
      id,
      this._doc,
      this._crdtDoc,
      this._registry,
    );
  }

  lastBlock(): BlockHandle | null {
    const len = this._doc.blockOrder.length;
    if (len === 0) return null;
    const id = (this._doc.blockOrder as CRDTArray<string>).get(
      len - 1,
    ) as string;
    return createBlockHandle(
      id,
      this._doc,
      this._crdtDoc,
      this._registry,
    );
  }

  blockCount(): number {
    return this._doc.blockOrder.length;
  }

  // ── Selection ────────────────────────────────────────────

  setSelection(selection: SelectionState): void {
    this._selection.setSelection(selection);
  }

  getSelection(): SelectionState {
    return this._selection.getSelection();
  }

  selectBlock(blockId: string): void {
    this._selection.selectBlock(blockId);
  }

  selectBlocks(blockIds: string[]): void {
    this._selection.selectBlocks(blockIds);
  }

  selectText(blockId: string, from: number, to: number): void {
    this._selection.selectText(blockId, from, to);
  }

  selectAll(): void {
    this._selection.selectAll();
  }

  getSelectedText(): string {
    return this._selection.getSelectedText();
  }

  getSelectedBlocks(): BlockHandle[] {
    return this._selection.getSelectedBlocks();
  }

  replaceSelection(content: string | Block[]): void {
    const sel = this._selection.getSelection();
    if (!sel) return;

    if (sel.type === "text") {
      const from = Math.min(sel.anchor.offset, sel.focus.offset);
      const to = Math.max(sel.anchor.offset, sel.focus.offset);
      // Errata #5: batch in single apply
      const ops: DocumentOp[] = [];
      if (to > from) {
        ops.push({
          type: "delete-text",
          blockId: sel.anchor.blockId,
          offset: from,
          length: to - from,
        });
      }
      if (typeof content === "string" && content.length > 0) {
        ops.push({
          type: "insert-text",
          blockId: sel.anchor.blockId,
          offset: from,
          text: content,
        });
      }
      if (ops.length > 0) {
        this.apply(ops);
      }
      return;
    }

    if (sel.type === "block" && sel.blockIds.length > 0) {
      const firstId = sel.blockIds[0];
      const firstIndex = this._pipeline._resolvePosition({
        before: firstId,
      });
      const ops: DocumentOp[] = [];

      for (const id of sel.blockIds) {
        ops.push({ type: "delete-block", blockId: id });
      }

      const insertPosition: Position =
        firstIndex === 0
          ? "first"
          : {
            after: (
              this._doc.blockOrder as CRDTArray<string>
            ).get(firstIndex - 1) as string,
          };

      if (typeof content === "string") {
        const newId = crypto.randomUUID();
        ops.push({
          type: "insert-block",
          blockId: newId,
          blockType: "paragraph",
          props: {},
          position: insertPosition,
        });
        if (content.length > 0) {
          ops.push({
            type: "insert-text",
            blockId: newId,
            offset: 0,
            text: content,
          });
        }
      } else if (Array.isArray(content)) {
        let prevPosition = insertPosition;
        for (const block of content) {
          const newId = crypto.randomUUID();
          ops.push({
            type: "insert-block",
            blockId: newId,
            blockType: block.type,
            props: block.props ?? {},
            position: prevPosition,
          });
          if (typeof block.content === "string" && block.content.length > 0) {
            ops.push({
              type: "insert-text",
              blockId: newId,
              offset: 0,
              text: block.content,
            });
          }
          prevPosition = { after: newId };
        }
      }

      this.apply(ops);
    }
  }

  deleteSelection(): void {
    const sel = this._selection.getSelection();
    if (!sel) return;

    if (sel.type === "text") {
      const from = Math.min(sel.anchor.offset, sel.focus.offset);
      const to = Math.max(sel.anchor.offset, sel.focus.offset);
      if (to > from) {
        this.apply([
          {
            type: "delete-text",
            blockId: sel.anchor.blockId,
            offset: from,
            length: to - from,
          },
        ]);
      }
      this.setSelection({
        type: "text",
        anchor: { blockId: sel.anchor.blockId, offset: from },
        focus: { blockId: sel.anchor.blockId, offset: from },
        isCollapsed: true,
        isMultiBlock: false,
        blockRange: [sel.anchor.blockId],
        toRange: () =>
          new DocumentRangeImpl(
            { blockId: sel.anchor.blockId, offset: from },
            { blockId: sel.anchor.blockId, offset: from },
            this._doc,
          ),
      });
      return;
    }

    if (sel.type === "block") {
      const ops: DocumentOp[] = sel.blockIds.map((id) => ({
        type: "delete-block" as const,
        blockId: id,
      }));
      this.apply(ops);
      this.setSelection(null);
    }
  }

  // ── Decorations ──────────────────────────────────────────

  requestDecorationUpdate(): void {
    const decoSet = this._extensions.collectDecorations(
      this._documentState,
      this,
    );
    this._emitter.emit("decorationsChange", decoSet.generation);
  }

  getDecorations(): DecorationSet {
    return this._extensions.collectDecorations(
      this._documentState,
      this,
    );
  }

  // ── Events ───────────────────────────────────────────────

  on<K extends keyof PenEventMap>(
    event: K,
    handler: PenEventMap[K],
  ): Unsubscribe;
  on(
    event: string,
    handler: (...args: unknown[]) => void,
  ): Unsubscribe;
  on(
    event: string,
    handler: (...args: unknown[]) => void,
  ): Unsubscribe {
    return this._emitter.on(event, handler);
  }

  onDocumentChange(
    callback: PenEventMap["documentChange"],
  ): Unsubscribe {
    return this.on("documentChange", callback);
  }

  onSelectionChange(
    callback: PenEventMap["selectionChange"],
  ): Unsubscribe {
    return this.on("selectionChange", callback);
  }

  // ── Extension State ──────────────────────────────────────

  getExtensionState<T>(name: string): T | undefined {
    return this._extensions.getExtensionState<T>(name);
  }

  // ── Normalization ────────────────────────────────────────

  normalizeAll(): void {
    this._engine.normalizeAll();
  }

  // ── Destroy ──────────────────────────────────────────────

  destroy(): void {
    void this._extensions.deactivateAll(this);
    this._awareness?.destroy();
    this._teardownObservation();
    this._emitter.removeAllListeners();
  }

  // ── Private ──────────────────────────────────────────────

  private _createPenDocument(crdtDoc: CRDTDocument): PenDocument {
    const wrapped = crdtDoc as CRDTDocument & { penDocument?: PenDocument };
    if (wrapped.penDocument) {
      return wrapped.penDocument;
    }

    const raw = this._adapter.raw<any>(crdtDoc);
    return {
      blockOrder: raw.getArray
        ? raw.getArray("blockOrder")
        : raw.blockOrder,
      blocks: raw.getMap
        ? raw.getMap("blocks")
        : raw.blocks,
      apps: raw.getMap
        ? raw.getMap("apps")
        : raw.apps,
      metadata: raw.getMap
        ? raw.getMap("metadata")
        : raw.metadata,
      adapter: this._adapter,
    };
  }

  private _resolveExtensions(
    options: CreateEditorOptions,
  ): Extension[] {
    const without = new Set(options.without ?? []);
    const defaults: Extension[] = [
      documentOpsExtension(),
      deltaStreamExtension(),
      undoExtension(),
    ].filter((ext) => !without.has(ext.name));

    const userExtensions = options.extensions ?? [];
    return [...defaults, ...userExtensions];
  }

  private _refreshCoreSlots(): void {
    this._slots.set("core:engine", this._engine);
  }

  private _refreshUndoManager(): void {
    const slotUndo = this._slots.get("undo:manager") as
      | UndoManager
      | undefined;
    (this as { undoManager: UndoManager }).undoManager =
      slotUndo ?? NOOP_UNDO;
  }

  private _activateExtensions(): void {
    const activation = this._extensions.activateAll(this);
    this._refreshUndoManager();
    void activation.then(() => {
      this._refreshUndoManager();
    });
  }

  private _ensureInitialParagraph(): void {
    if (this._doc.blockOrder.length > 0) {
      return;
    }

    this.apply(
      [
        {
          type: "insert-block",
          blockId: crypto.randomUUID(),
          blockType: "paragraph",
          props: {},
          position: "last",
        },
      ],
      { origin: "system" },
    );
  }

  private _emitDocumentChange(event: CRDTEvent): void {
    this._emitter.emit("documentChange", {
      ops: event.ops,
      origin: event.origin,
      affectedBlocks: [...event.affectedBlocks],
    });
  }

  private _wireObservation(): void {
    this._unsubObserve = this._adapter.observe(
      this._crdtDoc,
      (event: CRDTEvent) => {
        if (this._pipeline.suppressObserver) return;
        this._documentState.incrementalUpdate(event.affectedBlocks);
        this._extensions.dispatchObserve([event], this);
        this._emitter.emit("change", [event]);
        this._emitDocumentChange(event);
      },
    );
  }

  private _teardownObservation(): void {
    if (this._unsubObserve) {
      this._unsubObserve();
      this._unsubObserve = null;
    }
  }
}

export function createEditor(options?: CreateEditorOptions): Editor {
  return new EditorImpl(options);
}
