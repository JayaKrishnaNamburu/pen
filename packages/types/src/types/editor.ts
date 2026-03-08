import type { Block } from "./block.js";
import type { SelectionState } from "./selection.js";
import type {
	CRDTAdapter,
	CRDTDocument,
	CRDTEvent,
	PenDocument,
	Awareness,
} from "./crdt.js";
import type { DocumentOp, OpOrigin, ApplyOptions } from "./ops.js";
import type { DecorationSet } from "./decorations.js";
import type { Extension } from "./extension.js";
import type { BlockHandle, AppHandle } from "./handles.js";
import type { Unsubscribe } from "./utility.js";
import type { SchemaRegistry } from "./schema.js";
import type { AssetProvider } from "./persistence.js";

// ── Document State ──────────────────────────────────────────

export interface DocumentState {
	readonly blockOrder: readonly string[];
	readonly blockCount: number;
	readonly blocks: Iterable<BlockHandle>;
	readonly isEmpty: boolean;
	readonly generation: number;
	allBlocks(): Iterable<BlockHandle>;
	blockAt(index: number): string | null;
	indexOf(blockId: string): number;
	parentOf(blockId: string): string | null;
}

// ── Undo Manager ────────────────────────────────────────────

export interface UndoManager {
	undo(): boolean;
	redo(): boolean;
	canUndo(): boolean;
	canRedo(): boolean;

	stopCapturing(): void;
	setGroupTimeout(ms: number): void;

	setTrackedOrigins(origins: OpOrigin[]): void;

	onStackChange(callback: () => void): Unsubscribe;
}

export interface UndoHistoryRestore {
	focusBlockId: string | null;
	requestId: number;
}

export interface HistoryAppliedEvent {
	kind: "undo" | "redo";
	selection: SelectionState;
	focusBlockId: string | null;
	requestId: number;
}

export interface DocumentCommitEvent {
	commitId: number;
	ops: readonly DocumentOp[];
	origin: OpOrigin;
	affectedBlocks: string[];
	blockRevisions: Readonly<Record<string, number>>;
}

// ── Schema Engine ───────────────────────────────────────────

export interface SchemaEngine {
	markDirty(blockId: string): void;
	normalizeDirty(): void;
	normalizeAll(): void;
}

// ── Diagnostic Events ───────────────────────────────────────

export interface DiagnosticEvent {
	code: string;
	level: "warn" | "error" | "info";
	source: string;
	message: string;
	remediation?: string;
	op?: DocumentOp;
	extension?: string;
	error?: unknown;
	[key: string]: unknown;
}

export interface DocumentValidationError {
	code:
		| "MISSING_SHARED_TYPE"
		| "INVALID_BLOCK_STRUCTURE"
		| "ORPHAN_BLOCK"
		| "DUPLICATE_BLOCK_ORDER"
		| "UNKNOWN_CONTENT_TYPE"
		| "MISSING_BLOCK_MAP_KEY";
	blockId?: string;
	message: string;
	severity: "error" | "warning";
}

// ── Editor Events ───────────────────────────────────────────

export interface PenEventMap {
	change: (events: CRDTEvent[]) => void;
	documentCommit: (event: DocumentCommitEvent) => void;
	historyApplied: (event: HistoryAppliedEvent) => void;
	decorationsChange: (generation: number) => void;
	selectionChange: (selection: SelectionState) => void;
	diagnostic: (event: DiagnosticEvent) => void;
	"crdt:corruption": (errors: DocumentValidationError[]) => void;
	"crdt:recovered": (method: "snapshot" | "repair" | "reimport") => void;
}

// ── Hook Priority Constants ─────────────────────────────────

export const HOOK_PRIORITY_AUTH = 100;
export const HOOK_PRIORITY_SUGGEST = 200;
export const HOOK_PRIORITY_INPUT_RULE = 300;
export const HOOK_PRIORITY_DEFAULT = 500;

// ── Editor Options ──────────────────────────────────────────

export interface CreateEditorOptions {
	schema?: SchemaRegistry;
	extensions?: Extension[];
	without?: string[];
	crdt?: CRDTAdapter;
	assets?: AssetProvider;
}

// ── Command Context ─────────────────────────────────────────

export interface CommandContext {
	editor: Editor;
	selection: SelectionState;
	activeBlock: BlockHandle | null;
}

// ── Editor Interface ────────────────────────────────────────

export interface Editor {
	apply(ops: DocumentOp[], options?: ApplyOptions): void;
	loadDocument(doc: CRDTDocument): void;

	onBeforeApply(
		hook: (ops: DocumentOp[], options: ApplyOptions) => DocumentOp[],
		options?: { priority?: number },
	): Unsubscribe;

	readonly schema: SchemaRegistry;
	readonly selection: SelectionState;
	readonly documentState: DocumentState;
	readonly internals: EditorInternals;
	readonly clientId: number;

	blocks(type?: string): Iterable<BlockHandle>;
	getBlock(blockId: string): BlockHandle | null;
	firstBlock(): BlockHandle | null;
	lastBlock(): BlockHandle | null;
	blockCount(): number;
	getBlockRevision(blockId: string): number;

	setSelection(selection: SelectionState): void;
	getSelection(): SelectionState;
	selectBlock(blockId: string): void;
	selectBlocks(blockIds: string[]): void;
	selectText(blockId: string, from: number, to: number): void;
	selectTextRange(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void;
	selectAll(): void;

	getSelectedText(): string;
	getSelectedBlocks(): BlockHandle[];
	replaceSelection(content: string | Block[]): void;
	deleteSelection(): void;

	requestDecorationUpdate(): void;
	scrollToBlock?(blockId: string): void;

	onDocumentCommit(callback: PenEventMap["documentCommit"]): Unsubscribe;
	onSelectionChange(callback: PenEventMap["selectionChange"]): Unsubscribe;
	onHistoryApplied(callback: PenEventMap["historyApplied"]): Unsubscribe;

	on<K extends keyof PenEventMap>(
		event: K,
		handler: PenEventMap[K],
	): Unsubscribe;
	on(event: string, handler: (...args: unknown[]) => void): Unsubscribe;

	readonly undoManager: UndoManager;

	getExtensionState<T>(name: string): T | undefined;

	normalizeAll(): void;
	destroy(): void;
}

export interface EditorInternals {
	readonly adapter: CRDTAdapter;
	readonly crdtDoc: CRDTDocument;
	readonly doc: PenDocument;
	readonly engine: SchemaEngine;
	readonly awareness: Awareness | null;
	emit<K extends keyof PenEventMap>(
		event: K,
		...args: Parameters<PenEventMap[K]>
	): void;
	getSlot<T>(key: string): T | undefined;
	setSlot(key: string, value: unknown): void;
}
