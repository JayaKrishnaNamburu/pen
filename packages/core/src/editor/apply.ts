import type {
  DocumentOp,
  OpOrigin,
  PenDocument,
  CRDTDocument,
  CRDTAdapter,
  CRDTEvent,
  SchemaRegistry,
  CRDTMap,
  CRDTArray,
  InsertBlockOp,
  UpdateBlockOp,
  DeleteBlockOp,
  MoveBlockOp,
  ConvertBlockOp,
  SplitBlockOp,
  MergeBlocksOp,
  InsertTextOp,
  DeleteTextOp,
  FormatTextOp,
  ReplaceTextOp,
  InsertInlineNodeOp,
  RemoveInlineNodeOp,
  UpdateLayoutOp,
  SetMetaOp,
  CreateAppOp,
  UpdateAppOp,
  DeleteAppOp,
  SetSelectionOp,
} from "@pen/types";
import type { SchemaEngineImpl } from "../schema/normalize.js";
import type { EventEmitter } from "./events.js";
import type { SelectionManagerImpl } from "./selection.js";
import type { ExtensionManagerImpl } from "./extensionManager.js";

// Typed CRDT structure interfaces used by the op executor.
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;

interface CRDTText {
  insert(
    offset: number,
    text: string,
    attributes?: Record<string, unknown>,
  ): void;
  delete(offset: number, length: number): void;
  format(
    offset: number,
    length: number,
    attributes: Record<string, unknown>,
  ): void;
  toDelta(): Array<{
    insert: string | object;
    attributes?: Record<string, unknown>;
  }>;
  toString(): string;
  readonly length: number;
}

const ZERO_WIDTH_SPACE = "\u200B";

export class ApplyPipeline {
  private _doc: PenDocument;
  private _crdtDoc: CRDTDocument;
  private readonly _adapter: CRDTAdapter;
  private readonly _registry: SchemaRegistry;
  private _engine: SchemaEngineImpl;
  private readonly _emitter: EventEmitter;
  private readonly _selection: SelectionManagerImpl;
  private _extensions!: ExtensionManagerImpl;
  private _editor!: import("@pen/types").Editor;
  private _onDidApply: ((affectedBlocks: readonly string[]) => void) | null =
    null;
  private _applying = false;
  private _suppressObserver = false;
  private readonly _queue: { ops: DocumentOp[]; origin: OpOrigin }[] = [];
  private _beforeApplyHooks: Array<{
    hook: (
      ops: DocumentOp[],
      options: { origin?: OpOrigin },
    ) => DocumentOp[];
    priority: number;
  }> = [];

  get suppressObserver(): boolean {
    return this._suppressObserver;
  }

  private get blocks(): CRDTBlockMap {
    return this._doc.blocks as CRDTBlockMap;
  }

  private get blockOrder(): CRDTArray<string> {
    return this._doc.blockOrder as CRDTArray<string>;
  }

  private get apps(): CRDTMap<CRDTMap<unknown>> {
    return this._doc.apps as CRDTMap<CRDTMap<unknown>>;
  }

  constructor(
    doc: PenDocument,
    crdtDoc: CRDTDocument,
    adapter: CRDTAdapter,
    registry: SchemaRegistry,
    engine: SchemaEngineImpl,
    emitter: EventEmitter,
    selection: SelectionManagerImpl,
  ) {
    this._doc = doc;
    this._crdtDoc = crdtDoc;
    this._adapter = adapter;
    this._registry = registry;
    this._engine = engine;
    this._emitter = emitter;
    this._selection = selection;
  }

  /** Called after EditorImpl construction to wire circular refs. */
  _init(
    editor: import("@pen/types").Editor,
    extensions: ExtensionManagerImpl,
    onDidApply?: (affectedBlocks: readonly string[]) => void,
  ): void {
    this._editor = editor;
    this._extensions = extensions;
    this._onDidApply = onDidApply ?? null;
  }

  // ── Before-Apply Hooks ───────────────────────────────────

  addBeforeApplyHook(
    hook: (
      ops: DocumentOp[],
      options: { origin?: OpOrigin },
    ) => DocumentOp[],
    priority: number,
  ): () => void {
    const entry = { hook, priority };
    this._beforeApplyHooks.push(entry);
    this._beforeApplyHooks.sort((a, b) => a.priority - b.priority);
    return () => {
      const idx = this._beforeApplyHooks.indexOf(entry);
      if (idx >= 0) this._beforeApplyHooks.splice(idx, 1);
    };
  }

  // ── Apply ────────────────────────────────────────────────

  apply(ops: DocumentOp[], origin: OpOrigin): void {
    this._applyInternal(ops, origin);
  }

  private _applyInternal(ops: DocumentOp[], origin: OpOrigin): void {
    if (this._applying) {
      this._queue.push({ ops, origin });
      return;
    }

    this._applying = true;
    try {
      this._executeOps(ops, origin);
      while (this._queue.length > 0) {
        const { ops: queued, origin: queuedOrigin } =
          this._queue.shift()!;
        this._executeOps(queued, queuedOrigin);
      }
    } finally {
      this._applying = false;
    }
  }

  // ── Core Pipeline ────────────────────────────────────────

  private _executeOps(ops: DocumentOp[], origin: OpOrigin): void {
    // Run onBeforeApply hooks
    let transformedOps = ops;
    for (const { hook } of this._beforeApplyHooks) {
      try {
        transformedOps = hook(transformedOps, { origin });
      } catch (err) {
        this._emitter.emit("diagnostic", {
          code: "PEN_APPLY_005",
          level: "error",
          source: "apply",
          message: "onBeforeApply hook threw",
          remediation:
            "Update the onBeforeApply hook to handle incoming ops defensively and " +
            "always return a valid DocumentOp array.",
          error: err,
        });
      }
    }

    const affectedBlocks: string[] = [];
    const validatedOps: DocumentOp[] = [];
    const pendingBlockIds = new Set<string>();

    for (const op of transformedOps) {
      const blockId = this._opBlockId(op);

      if (!this._validateOp(op)) continue;

      if (op.type === "insert-block") {
        pendingBlockIds.add(op.blockId);
      }

      if (
        blockId &&
        !this._blockExists(blockId) &&
        !pendingBlockIds.has(blockId) &&
        op.type !== "insert-block"
      ) {
        this._emitter.emit("diagnostic", {
          code: "PEN_APPLY_003",
          level: "warn",
          source: "apply",
          message: `apply: skipping ${op.type} for non-existent block "${blockId}"`,
        });
        continue;
      }

      validatedOps.push(op);
    }

    if (validatedOps.length === 0) return;

    this._suppressObserver = true;

    try {
      this._adapter.transact(
        this._crdtDoc,
        () => {
          for (const op of validatedOps) {
            const affected = this._executeSingleOp(op);
            affectedBlocks.push(...affected);
          }

          for (const blockId of affectedBlocks) {
            this._engine.markDirty(blockId);
          }

          this._engine.normalizeDirty();
        },
        origin,
      );
    } finally {
      this._suppressObserver = false;
    }

    const event: CRDTEvent = {
      origin,
      affectedBlocks: [...new Set(affectedBlocks)],
      ops: validatedOps,
      timestamp: Date.now(),
    };

    this._onDidApply?.(event.affectedBlocks);
    this._extensions?.dispatchObserve([event], this._editor);
    this._emitter.emit("change", [event]);
    this._emitter.emit("documentChange", {
      ops: validatedOps,
      origin,
      affectedBlocks: [...new Set(affectedBlocks)],
    });
  }

  // ── Schema Validation ────────────────────────────────────

  private _validateOp(op: DocumentOp): boolean {
    switch (op.type) {
      case "insert-block": {
        const schema = this._registry.resolve(op.blockType);
        if (!schema) {
          this._emitter.emit("diagnostic", {
            code: "PEN_APPLY_002",
            level: "warn",
            source: "apply",
            message: `Unknown block type: "${op.blockType}"`,
            op,
          });
          return false;
        }
        return true;
      }
      case "convert-block": {
        const schema = this._registry.resolve(op.newType);
        if (!schema) {
          this._emitter.emit("diagnostic", {
            code: "PEN_APPLY_002",
            level: "warn",
            source: "apply",
            message: `Unknown block type: "${op.newType}"`,
            op,
          });
          return false;
        }
        return true;
      }
      case "insert-inline-node": {
        const schema = this._registry.resolveInline(op.nodeType);
        if (!schema || schema.kind !== "node") {
          this._emitter.emit("diagnostic", {
            code: "PEN_APPLY_002",
            level: "warn",
            source: "apply",
            message: `Unknown inline node type: "${op.nodeType}"`,
            op,
          });
          return false;
        }
        return true;
      }
      default:
        return true;
    }
  }

  // ── Position Resolution ──────────────────────────────────

  _resolvePosition(
    position: import("@pen/types").Position,
  ): number {
    const blockOrder = this._doc.blockOrder;

    if (position === "first") return 0;
    if (position === "last") return blockOrder.length;

    if (typeof position === "object" && "after" in position) {
      for (let i = 0; i < blockOrder.length; i++) {
        if ((blockOrder.get(i) as string) === position.after)
          return i + 1;
      }
      return blockOrder.length;
    }

    if (typeof position === "object" && "before" in position) {
      for (let i = 0; i < blockOrder.length; i++) {
        if ((blockOrder.get(i) as string) === position.before) return i;
      }
      return 0;
    }

    if (typeof position === "object" && "parent" in position) {
      const parentMap = this.blocks.get(position.parent);
      if (!parentMap) return blockOrder.length;
      const children = parentMap.get("children") as
        | CRDTArray<string>
        | undefined;
      if (!children) return 0;
      return Math.min(position.index, children.length);
    }

    return blockOrder.length;
  }

  // ── Op Dispatch ──────────────────────────────────────────

  private _executeSingleOp(op: DocumentOp): string[] {
    switch (op.type) {
      case "insert-block":
        return this._insertBlock(op);
      case "update-block":
        return this._updateBlock(op);
      case "delete-block":
        return this._deleteBlock(op);
      case "move-block":
        return this._moveBlock(op);
      case "convert-block":
        return this._convertBlock(op);
      case "split-block":
        return this._splitBlock(op);
      case "merge-blocks":
        return this._mergeBlocks(op);
      case "insert-text":
        return this._insertText(op);
      case "delete-text":
        return this._deleteText(op);
      case "format-text":
        return this._formatText(op);
      case "replace-text":
        return this._replaceText(op);
      case "insert-inline-node":
        return this._insertInlineNode(op);
      case "remove-inline-node":
        return this._removeInlineNode(op);
      case "set-selection":
        return this._setSelection(op);
      case "update-layout":
        return this._updateLayout(op);
      case "create-app":
        return this._createApp(op);
      case "update-app":
        return this._updateApp(op);
      case "delete-app":
        return this._deleteApp(op);
      case "insert-table-row":
      case "delete-table-row":
      case "insert-table-column":
      case "delete-table-column":
      case "merge-table-cells":
      case "split-table-cell":
        return this._tableOp(op);
      case "set-meta":
        return this._setMeta(op);
      default:
        return [];
    }
  }

  // ── Block Ops ────────────────────────────────────────────

  private _insertBlock(op: InsertBlockOp): string[] {
    const schema = this._registry.resolve(op.blockType);
    if (!schema) return [];

    const contentType = Array.isArray(schema.content)
      ? "nested"
      : schema.content === "inline"
        ? "inline"
        : schema.content === "table"
          ? "table"
          : "none";
    const blockMap = this._adapter.initBlockMap(
      this._crdtDoc,
      op.blockId,
      op.blockType,
      contentType,
    );

    if (op.props && Object.keys(op.props).length > 0) {
      const propsMap = (blockMap as CRDTMap<unknown>).get("props") as
        | CRDTMap<unknown>
        | undefined;
      if (propsMap) {
        for (const [key, value] of Object.entries(op.props)) {
          (propsMap as any).set(key, value);
        }
      }
    }

    if (typeof op.position === "object" && "parent" in op.position) {
      const parentMap = this.blocks.get(op.position.parent);
      if (parentMap) {
        let children = parentMap.get("children") as any;
        if (!children) {
          children = this._adapter.createArray();
          (parentMap as any).set("children", children);
        }
        const idx = Math.min(op.position.index, children.length);
        children.insert(idx, [op.blockId]);
      }
    } else {
      const idx = this._resolvePosition(op.position);
      (this.blockOrder as any).insert(idx, [op.blockId]);
    }

    return [op.blockId];
  }

  private _updateBlock(op: UpdateBlockOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];

    let propsMap = blockMap.get("props") as any;
    if (!propsMap) {
      propsMap = this._adapter.createMap();
      (blockMap as any).set("props", propsMap);
    }

    for (const [key, value] of Object.entries(op.props)) {
      if (value === undefined || value === null) {
        propsMap.delete(key);
      } else {
        propsMap.set(key, value);
      }
    }

    return [op.blockId];
  }

  private _deleteBlock(op: DeleteBlockOp): string[] {
    (this.blocks as any).delete(op.blockId);

    for (let i = (this.blockOrder as any).length - 1; i >= 0; i--) {
      if (this.blockOrder.get(i) === op.blockId) {
        (this.blockOrder as any).delete(i, 1);
      }
    }

    for (const [, parentMap] of this.blocks.entries()) {
      const children = parentMap.get("children") as any;
      if (!children) continue;
      for (let i = children.length - 1; i >= 0; i--) {
        if (children.get(i) === op.blockId) {
          children.delete(i, 1);
        }
      }
    }

    return [op.blockId];
  }

  private _moveBlock(op: MoveBlockOp): string[] {
    // Remove from current position
    for (let i = (this.blockOrder as any).length - 1; i >= 0; i--) {
      if (this.blockOrder.get(i) === op.blockId) {
        (this.blockOrder as any).delete(i, 1);
        break;
      }
    }

    for (const [, parentMap] of this.blocks.entries()) {
      const children = parentMap.get("children") as any;
      if (!children) continue;
      for (let i = children.length - 1; i >= 0; i--) {
        if (children.get(i) === op.blockId) {
          children.delete(i, 1);
        }
      }
    }

    // Insert at new position
    if (typeof op.position === "object" && "parent" in op.position) {
      const parentMap = this.blocks.get(op.position.parent);
      if (parentMap) {
        let children = parentMap.get("children") as any;
        if (!children) {
          children = this._adapter.createArray();
          (parentMap as any).set("children", children);
        }
        const idx = Math.min(op.position.index, children.length);
        children.insert(idx, [op.blockId]);
      }
    } else {
      const idx = this._resolvePosition(op.position);
      (this.blockOrder as any).insert(idx, [op.blockId]);
    }

    return [op.blockId];
  }

  private _convertBlock(op: ConvertBlockOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];

    const oldType = blockMap.get("type") as string;
    const oldSchema = this._registry.resolve(oldType);
    const newSchema = this._registry.resolve(op.newType);
    if (!newSchema) return [];

    (blockMap as any).set("type", op.newType);

    const propsMap = blockMap.get("props") as any;
    if (propsMap) {
      const newPropKeys = new Set(
        Object.keys(newSchema.propSchema ?? {}),
      );
      for (const key of [...(propsMap.keys?.() ?? [])]) {
        if (!newPropKeys.has(key)) {
          propsMap.delete(key);
        }
      }
    }

    if (op.newProps) {
      let props = blockMap.get("props") as any;
      if (!props) {
        props = this._adapter.createMap();
        (blockMap as any).set("props", props);
      }
      for (const [key, value] of Object.entries(op.newProps)) {
        props.set(key, value);
      }
    }

    const oldContent = oldSchema?.content;
    const newContent = newSchema.content;

    if (oldContent === "inline" && newContent !== "inline") {
      if (newContent === "none" || newContent === "table" || Array.isArray(newContent)) {
        (blockMap as any).delete("content");
      }
    } else if (oldContent !== "inline" && newContent === "inline") {
      const ytext = this._adapter.createText();
      (blockMap as any).set("content", ytext);
    }

    return [op.blockId];
  }

  private _splitBlock(op: SplitBlockOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];

    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content || typeof content.toDelta !== "function") return [];

    const oldType = blockMap.get("type") as string;
    const newType = op.newBlockType ?? oldType;
    const schema = this._registry.resolve(newType);

    const deltas = content.toDelta();
    const tailDeltas: Array<{
      insert: string | object;
      attributes?: Record<string, unknown>;
    }> = [];
    let pos = 0;

    for (const delta of deltas) {
      const len =
        typeof delta.insert === "string" ? delta.insert.length : 1;
      if (pos + len <= op.offset) {
        pos += len;
        continue;
      }

      if (pos < op.offset) {
        const splitAt = op.offset - pos;
        const tailText = (delta.insert as string).slice(splitAt);
        if (tailText) {
          tailDeltas.push({
            insert: tailText,
            attributes: delta.attributes,
          });
        }
      } else {
        tailDeltas.push(delta);
      }
      pos += len;
    }

    const totalLength = content.length;
    if (op.offset < totalLength) {
      content.delete(op.offset, totalLength - op.offset);
    }

    // Use initBlockMap for proper block creation (errata #4)
    const contentType =
      schema && Array.isArray(schema.content)
        ? "nested"
        : schema?.content === "inline"
          ? "inline"
          : schema?.content === "table"
            ? "table"
            : "none";
    const newBlockMap = this._adapter.initBlockMap(
      this._crdtDoc,
      op.newBlockId,
      newType,
      contentType as "inline" | "nested" | "table" | "none",
    ) as CRDTMap<unknown>;

    const newContent = (newBlockMap as any).get("content") as
      | CRDTText
      | undefined;
    if (newContent) {
      for (const delta of tailDeltas) {
        newContent.insert(
          newContent.length,
          delta.insert as string,
          delta.attributes,
        );
      }
    }

    // Copy parentId if present
    const propsMap = blockMap.get("props") as CRDTMap<unknown> | undefined;
    if (propsMap?.get?.("parentId")) {
      const newProps = (newBlockMap as any).get("props") as any;
      if (newProps) {
        newProps.set("parentId", propsMap.get("parentId"));
      }
    }

    // Insert new block right after original in blockOrder
    for (let i = 0; i < this.blockOrder.length; i++) {
      if (this.blockOrder.get(i) === op.blockId) {
        (this.blockOrder as any).insert(i + 1, [op.newBlockId]);
        break;
      }
    }

    return [op.blockId, op.newBlockId];
  }

  private _mergeBlocks(op: MergeBlocksOp): string[] {
    const targetMap = this.blocks.get(op.targetBlockId);
    const sourceMap = this.blocks.get(op.sourceBlockId);
    if (!targetMap || !sourceMap) return [];

    const targetContent = targetMap.get("content") as
      | CRDTText
      | undefined;
    const sourceContent = sourceMap.get("content") as
      | CRDTText
      | undefined;

    if (
      targetContent &&
      sourceContent &&
      typeof sourceContent.toDelta === "function"
    ) {
      const deltas = sourceContent.toDelta();
      for (const delta of deltas) {
        targetContent.insert(
          targetContent.length,
          delta.insert as string,
          delta.attributes,
        );
      }
    }

    (this.blocks as any).delete(op.sourceBlockId);
    for (let i = (this.blockOrder as any).length - 1; i >= 0; i--) {
      if (this.blockOrder.get(i) === op.sourceBlockId) {
        (this.blockOrder as any).delete(i, 1);
        break;
      }
    }

    return [op.targetBlockId, op.sourceBlockId];
  }

  // ── Text Ops ─────────────────────────────────────────────

  private _insertText(op: InsertTextOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content) return [];

    if (content.length === 1 && content.toString() === ZERO_WIDTH_SPACE) {
      content.delete(0, 1);
    }

    const marks = op.marks
      ? this._resolveMarks(op.marks)
      : undefined;
    content.insert(op.offset, op.text, marks);
    return [op.blockId];
  }

  private _deleteText(op: DeleteTextOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content) return [];

    content.delete(op.offset, op.length);
    return [op.blockId];
  }

  private _formatText(op: FormatTextOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content) return [];

    content.format(op.offset, op.length, op.marks);
    return [op.blockId];
  }

  private _replaceText(op: ReplaceTextOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content) return [];

    if (content.length === 1 && content.toString() === ZERO_WIDTH_SPACE) {
      content.delete(0, 1);
    }

    content.delete(op.offset, op.length);
    const marks = op.marks
      ? this._resolveMarks(op.marks)
      : undefined;
    content.insert(op.offset, op.text, marks);
    return [op.blockId];
  }

  private _resolveMarks(
    marks: Record<string, unknown>,
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};
    for (const [type, value] of Object.entries(marks)) {
      const schema = this._registry.resolveInline(type);
      if (!schema) continue;
      resolved[type] = value;
    }
    return resolved;
  }

  // ── Inline Node Ops ──────────────────────────────────────

  private _insertInlineNode(op: InsertInlineNodeOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as any;
    if (!content) return [];

    content.insertEmbed(op.offset, {
      type: op.nodeType,
      ...op.props,
    });
    return [op.blockId];
  }

  private _removeInlineNode(op: RemoveInlineNodeOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];
    const content = blockMap.get("content") as CRDTText | undefined;
    if (!content) return [];

    content.delete(op.offset, 1);
    return [op.blockId];
  }

  // ── Selection Op ─────────────────────────────────────────

  private _setSelection(op: SetSelectionOp): string[] {
    this._selection.setSelection(op.selection);
    return [];
  }

  // ── Layout Op ────────────────────────────────────────────

  private _updateLayout(op: UpdateLayoutOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];

    let layoutMap = blockMap.get("layout") as any;
    if (!layoutMap) {
      layoutMap = this._adapter.createMap();
      (blockMap as any).set("layout", layoutMap);
    }

    for (const [key, value] of Object.entries(op.layout)) {
      if (value === undefined || value === null) {
        layoutMap.delete(key);
      } else {
        layoutMap.set(key, value);
      }
    }

    return [op.blockId];
  }

  // ── App Ops ──────────────────────────────────────────────

  private _createApp(op: CreateAppOp): string[] {
    const appMap = this._adapter.createMap() as CRDTMap<unknown>;
    (appMap as any).set("type", op.appType);
    (appMap as any).set("placement", op.placement);

    if (op.config && Object.keys(op.config).length > 0) {
      const configMap = this._adapter.createMap() as any;
      for (const [key, value] of Object.entries(op.config)) {
        configMap.set(key, value);
      }
      (appMap as any).set("config", configMap);
    }

    (this.apps as any).set(op.appId, appMap);
    return [];
  }

  private _updateApp(op: UpdateAppOp): string[] {
    const appMap = this.apps.get(op.appId);
    if (!appMap) return [];

    let configMap = appMap.get("config") as any;
    if (!configMap) {
      configMap = this._adapter.createMap();
      (appMap as any).set("config", configMap);
    }

    for (const [key, value] of Object.entries(op.patch)) {
      if (value === undefined || value === null) {
        configMap.delete(key);
      } else {
        configMap.set(key, value);
      }
    }
    return [];
  }

  private _deleteApp(op: DeleteAppOp): string[] {
    (this.apps as any).delete(op.appId);
    return [];
  }

  // ── Table Ops ────────────────────────────────────────────

  private _tableOp(op: DocumentOp): string[] {
    const tableOp = op as { type: string; blockId: string; index: number };
    const blockMap = this.blocks.get(tableOp.blockId);
    if (!blockMap) return [];

    const tableContent = blockMap.get("tableContent") as any;
    if (!tableContent) return [];

    switch (op.type) {
      case "insert-table-row": {
        const row = this._adapter.createArray() as any;
        const colCount =
          tableContent.length > 0
            ? (tableContent.get(0) as CRDTArray<unknown>).length
            : 1;
        for (let c = 0; c < colCount; c++) {
          const cell = this._adapter.createMap() as any;
          cell.set("content", this._adapter.createText());
          row.insert(row.length, [cell]);
        }
        tableContent.insert(tableOp.index, [row]);
        break;
      }
      case "delete-table-row": {
        if (tableOp.index < tableContent.length) {
          tableContent.delete(tableOp.index, 1);
        }
        break;
      }
      case "insert-table-column": {
        for (let r = 0; r < tableContent.length; r++) {
          const row = tableContent.get(r) as any;
          const cell = this._adapter.createMap() as any;
          cell.set("content", this._adapter.createText());
          row.insert(tableOp.index, [cell]);
        }
        break;
      }
      case "delete-table-column": {
        for (let r = 0; r < tableContent.length; r++) {
          const row = tableContent.get(r) as any;
          if (tableOp.index < row.length) {
            row.delete(tableOp.index, 1);
          }
        }
        break;
      }
      case "merge-table-cells":
      case "split-table-cell":
        break;
    }

    return [tableOp.blockId];
  }

  // ── Meta Op ──────────────────────────────────────────────

  private _setMeta(op: SetMetaOp): string[] {
    const blockMap = this.blocks.get(op.blockId);
    if (!blockMap) return [];

    let metaMap = blockMap.get("meta") as any;
    if (!metaMap) {
      metaMap = this._adapter.createMap();
      (blockMap as any).set("meta", metaMap);
    }

    // Errata #8: store as plain JSON, not nested Y.Maps
    if (op.data === null) {
      metaMap.delete(op.namespace);
    } else {
      metaMap.set(op.namespace, op.data);
    }

    return [op.blockId];
  }

  // ── Helpers ──────────────────────────────────────────────

  private _blockExists(blockId: string): boolean {
    return this.blocks.has(blockId);
  }

  private _opBlockId(op: DocumentOp): string | null {
    if ("blockId" in op) return (op as { blockId: string }).blockId;
    if ("targetBlockId" in op)
      return (op as { targetBlockId: string }).targetBlockId;
    if ("appId" in op) return null;
    return null;
  }

  updateDocument(
    doc: PenDocument,
    crdtDoc: CRDTDocument,
    engine: SchemaEngineImpl,
  ): void {
    this._doc = doc;
    this._crdtDoc = crdtDoc;
    this._engine = engine;
  }
}
