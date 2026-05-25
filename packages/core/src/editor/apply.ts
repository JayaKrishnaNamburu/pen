import type { DocumentOp, OpOrigin, PenDocument, CRDTDocument, CRDTAdapter, CRDTEvent, SchemaRegistry, CRDTMap, CRDTArray, InsertBlockOp, UpdateBlockOp, DeleteBlockOp, MoveBlockOp, ConvertBlockOp, SplitBlockOp, MergeBlocksOp, InsertTextOp, DeleteTextOp, FormatTextOp, ReplaceTextOp, InsertInlineNodeOp, RemoveInlineNodeOp, UpdateLayoutOp, SetMetaOp, CreateAppOp, UpdateAppOp, DeleteAppOp, SetSelectionOp, UpdateTableColumnsOp } from "@pen/types";
import { generateId, getOpOriginType } from "@pen/types";
import { resolveRuntimeContentType } from "../schema/contentType";
import type { SchemaEngineImpl } from "../schema/normalize";
import { type CRDTUnknownArray, type CRDTUnknownMap, getArrayProp, getMapProp, getStringProp, getTableColumns, getTableContent, isCRDTMap } from "./crdtShapes";
import { DatabaseOpExecutor } from "./databaseOpExecutor";
import type { EventEmitter } from "./events";
import type { SelectionManagerImpl } from "./selection";
import { TableGridExecutor } from "./tableGridExecutor";

import { blockExists, createMutableMap, getMutableBlockMap, getMutableAppMap, getOrCreateMapProp, getOrCreateStringArrayProp, removeBlockIdFromArray, removeBlockIdFromAllChildren, getTextContent, getInlineTextContent, opBlockId } from "./applySharedHelpers";
import { applyInternal, executeOps, emitApplyBoundary, validateOp, resolvePosition, executeSingleOp } from "./applyPipelineRunner";
import { insertBlock, updateBlock, deleteBlock, moveBlock, convertBlock, migrateTableToDatabase, splitBlock, mergeBlocks } from "./applyBlockOps";
import { insertText, deleteText, formatText, replaceText, resolveMarks, insertInlineNode, removeInlineNode, setSelectionOp, updateLayout, createApp, updateApp, deleteApp, tableOp, databaseOp, clearTableState, clearDatabaseState, isDatabaseStructuralTableOp, getPreservedInlineDeltas, setMeta } from "./applyInlineAndMetaOps";
// Typed CRDT structure interfaces used by the op executor.
type CRDTBlockMap = CRDTMap<CRDTMap<unknown>>;
type MutableMap = CRDTUnknownMap & { delete(key: string): void };
type MutableBlockStore = MutableMap & {
	get(key: string): CRDTUnknownMap | undefined;
};
type MutableAppStore = MutableMap & {
	get(key: string): CRDTUnknownMap | undefined;
};
type MutableStringArray = CRDTUnknownArray<string>;

interface CRDTInlineText extends CRDTText {
	insertEmbed(offset: number, value: Record<string, unknown>): void;
}

interface CRDTText {
	insert(
		offset: number,
		text: string,
		attributes?: Record<string, unknown | null>,
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
	private readonly _tableGrid: TableGridExecutor;
	private readonly _databaseOps: DatabaseOpExecutor;
	private _engine: SchemaEngineImpl;
	private readonly _emitter: EventEmitter;
	private readonly _selection: SelectionManagerImpl;
	private _onDidApply: ((event: CRDTEvent) => void) | null = null;
	private _applying = false;
	private _suppressObserver = false;
	private readonly _queue: { ops: DocumentOp[]; origin: OpOrigin }[] = [];
	private _applyBoundaryHooks: Array<
		(event: {
			phase: "before" | "after";
			ops: readonly DocumentOp[];
			origin: OpOrigin;
			applied: boolean;
		}) => void
	> = [];
	private _beforeApplyHooks: Array<{
		hook: (
			ops: DocumentOp[],
			options: { origin?: OpOrigin },
		) => DocumentOp[];
		priority: number;
	}> = [];
	private _finalBeforeApplyHook:
		| ((ops: DocumentOp[], options: { origin?: OpOrigin }) => DocumentOp[])
		| null = null;

	get suppressObserver(): boolean {
		return this._suppressObserver;
	}

	private get blocks(): CRDTBlockMap {
		return this._doc.blocks as CRDTBlockMap;
	}

	private get mutableBlocks(): MutableBlockStore {
		return this._doc.blocks as unknown as MutableBlockStore;
	}

	private get blockOrder(): CRDTArray<string> {
		return this._doc.blockOrder as CRDTArray<string>;
	}

	private get mutableBlockOrder(): MutableStringArray {
		return this._doc.blockOrder as unknown as MutableStringArray;
	}

	private get apps(): CRDTMap<CRDTMap<unknown>> {
		return this._doc.apps as CRDTMap<CRDTMap<unknown>>;
	}

	private get mutableApps(): MutableAppStore {
		return this._doc.apps as unknown as MutableAppStore;
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
		this._tableGrid = new TableGridExecutor(adapter);
		this._databaseOps = new DatabaseOpExecutor(adapter, this._tableGrid);
		this._engine = engine;
		this._emitter = emitter;
		this._selection = selection;
	}

	/** Called after EditorImpl construction to wire circular refs. */
	_init(onDidApply?: (event: CRDTEvent) => void): void {
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

	addApplyBoundaryHook(
		hook: (event: {
			phase: "before" | "after";
			ops: readonly DocumentOp[];
			origin: OpOrigin;
			applied: boolean;
		}) => void,
	): () => void {
		this._applyBoundaryHooks.push(hook);
		return () => {
			const idx = this._applyBoundaryHooks.indexOf(hook);
			if (idx >= 0) this._applyBoundaryHooks.splice(idx, 1);
		};
	}

	setFinalBeforeApplyHook(
		hook:
			| ((
					ops: DocumentOp[],
					options: { origin?: OpOrigin },
			  ) => DocumentOp[])
			| null,
	): void {
		this._finalBeforeApplyHook = hook;
	}

	// ── Apply ────────────────────────────────────────────────

	apply(ops: DocumentOp[], origin: OpOrigin): void {
		this._applyInternal(ops, origin);
	}

	private _applyInternal(ops: DocumentOp[], origin: OpOrigin): void {
		applyInternal(this, ops, origin);
	}

	// ── Core Pipeline ────────────────────────────────────────

	private _executeOps(ops: DocumentOp[], origin: OpOrigin): void {
		executeOps(this, ops, origin);
	}

	private _emitApplyBoundary(event: {
		phase: "before" | "after";
		ops: readonly DocumentOp[];
		origin: OpOrigin;
		applied: boolean;
	}): void {
		emitApplyBoundary(this, event);
	}

	// ── Schema Validation ────────────────────────────────────

	private _validateOp(op: DocumentOp): boolean {
		return validateOp(this, op);
	}

	// ── Position Resolution ──────────────────────────────────

	_resolvePosition(position: import("@pen/types").Position): number {
		return resolvePosition(this, position);
	}

	// ── Op Dispatch ──────────────────────────────────────────

	private _executeSingleOp(op: DocumentOp): string[] {
		return executeSingleOp(this, op);
	}

	// ── Block Ops ────────────────────────────────────────────

	private _insertBlock(op: InsertBlockOp): string[] {
		return insertBlock(this, op);
	}

	private _updateBlock(op: UpdateBlockOp): string[] {
		return updateBlock(this, op);
	}

	private _deleteBlock(op: DeleteBlockOp): string[] {
		return deleteBlock(this, op);
	}

	private _moveBlock(op: MoveBlockOp): string[] {
		return moveBlock(this, op);
	}

	private _convertBlock(op: ConvertBlockOp): string[] {
		return convertBlock(this, op);
	}

	private _migrateTableToDatabase(
		blockMap: MutableMap,
		propsMap: CRDTUnknownMap | null,
	): void {
		migrateTableToDatabase(this, blockMap, propsMap);
	}

	private _splitBlock(op: SplitBlockOp): string[] {
		return splitBlock(this, op);
	}

	private _mergeBlocks(op: MergeBlocksOp): string[] {
		return mergeBlocks(this, op);
	}

	// ── Text Ops ─────────────────────────────────────────────

	private _insertText(op: InsertTextOp): string[] {
		return insertText(this, op);
	}

	private _deleteText(op: DeleteTextOp): string[] {
		return deleteText(this, op);
	}

	private _formatText(op: FormatTextOp): string[] {
		return formatText(this, op);
	}

	private _replaceText(op: ReplaceTextOp): string[] {
		return replaceText(this, op);
	}

	private _resolveMarks(
		marks: Record<string, unknown | null>,
	): Record<string, unknown | null> {
		return resolveMarks(this, marks);
	}

	// ── Inline Node Ops ──────────────────────────────────────

	private _insertInlineNode(op: InsertInlineNodeOp): string[] {
		return insertInlineNode(this, op);
	}

	private _removeInlineNode(op: RemoveInlineNodeOp): string[] {
		return removeInlineNode(this, op);
	}

	// ── Selection Op ─────────────────────────────────────────

	private _setSelection(op: SetSelectionOp): string[] {
		return setSelectionOp(this, op);
	}

	// ── Layout Op ────────────────────────────────────────────

	private _updateLayout(op: UpdateLayoutOp): string[] {
		return updateLayout(this, op);
	}

	// ── App Ops ──────────────────────────────────────────────

	private _createApp(op: CreateAppOp): string[] {
		return createApp(this, op);
	}

	private _updateApp(op: UpdateAppOp): string[] {
		return updateApp(this, op);
	}

	private _deleteApp(op: DeleteAppOp): string[] {
		return deleteApp(this, op);
	}

	// ── Table Ops ────────────────────────────────────────────

	private _tableOp(op: DocumentOp): string[] {
		return tableOp(this, op);
	}

	private _databaseOp(op: DocumentOp): string[] {
		return databaseOp(this, op);
	}

	private _clearTableState(blockMap: MutableMap): void {
		clearTableState(this, blockMap);
	}

	private _clearDatabaseState(blockMap: MutableMap): void {
		clearDatabaseState(this, blockMap);
	}

	private _isDatabaseStructuralTableOp(type: string): boolean {
		return isDatabaseStructuralTableOp(this, type);
	}

	private _getPreservedInlineDeltas(content: CRDTText | undefined): Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}> {
		return getPreservedInlineDeltas(this, content);
	}


	// ── Meta Op ──────────────────────────────────────────────

	private _setMeta(op: SetMetaOp): string[] {
		return setMeta(this, op);
	}

	// ── Helpers ──────────────────────────────────────────────

	private _blockExists(blockId: string): boolean {
		return blockExists(this, blockId);
	}

	private _createMutableMap(): MutableMap {
		return createMutableMap(this);
	}

	private _getMutableBlockMap(blockId: string): MutableMap | null {
		return getMutableBlockMap(this, blockId);
	}

	private _getMutableAppMap(appId: string): MutableMap | null {
		return getMutableAppMap(this, appId);
	}

	private _getOrCreateMapProp(
		container: CRDTUnknownMap,
		key: string,
	): MutableMap {
		return getOrCreateMapProp(this, container, key);
	}

	private _getOrCreateStringArrayProp(
		container: CRDTUnknownMap,
		key: string,
	): MutableStringArray {
		return getOrCreateStringArrayProp(this, container, key);
	}

	private _removeBlockIdFromArray(
		array: MutableStringArray,
		blockId: string,
		stopAfterFirst = false,
	): void {
		removeBlockIdFromArray(this, array, blockId, stopAfterFirst);
	}

	private _removeBlockIdFromAllChildren(blockId: string): void {
		removeBlockIdFromAllChildren(this, blockId);
	}

	private _getTextContent(blockMap: CRDTUnknownMap): CRDTText | undefined {
		return getTextContent(this, blockMap);
	}

	private _getInlineTextContent(
		blockMap: CRDTUnknownMap,
	): CRDTInlineText | undefined {
		return getInlineTextContent(this, blockMap);
	}

	private _opBlockId(op: DocumentOp): string | null {
		return opBlockId(this, op);
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
