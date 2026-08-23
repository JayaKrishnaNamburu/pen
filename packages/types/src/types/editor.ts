import type { Block } from "./block";
import type {
	SelectionOrigin,
	SelectionRecord,
	SelectionState,
} from "./selection";
import type {
	CRDTAdapter,
	CRDTDocument,
	CRDTEvent,
	PenDocument,
	Awareness,
	DocumentSession,
	DocumentScope,
	DocumentProfile,
} from "./crdt";
import type { EditorAnchors } from "./anchors";
import type { ChangeSummary, Point } from "./changes";
import type { Facet, FacetOutput } from "./facets";
import type { DocumentOp, OpOrigin, ApplyOptions, StructuredOpOrigin } from "./ops";
import type { Decoration, DecorationSet } from "./decorations";
import type { Extension } from "./extension";
import type { BlockHandle, AppHandle } from "./handles";
import type { Unsubscribe } from "./utility";
import type { SchemaRegistry } from "./schema";
import type { AssetProvider } from "./persistence";
import type { A11yLabel } from "./a11y";
import type { MessageCatalog } from "./messages";

export type EditorViewMode = DocumentProfile;

/** Named commit-pipeline phases (`06-commit-pipeline.md`). */
export type PipelinePhase =
	| "hooks"
	| "validate"
	| "execute"
	| "normalize"
	| "summarize"
	| "map-selection"
	| "settle-facets"
	| "emit";

export type InteractionModel = "content-first" | "block-first";

// ── Document State ──────────────────────────────────────────

export interface DocumentState {
	readonly documentProfile: DocumentProfile;
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
	syncExplicitUndoGroup(groupId: string | null): void;
	setGroupTimeout(ms: number): void;

	registerTrackedOrigins(origins: OpOrigin[]): Unsubscribe;

	onStackChange(callback: () => void): Unsubscribe;
}

export interface UndoHistoryMetadataEntry<T = unknown> {
	before: T | null;
	after: T | null;
}

export interface UndoHistoryMetadataRestoreContext {
	editor: Editor;
	direction: "undo" | "redo";
	requestId: number;
}

export interface UndoHistoryMetadataController {
	getCurrentEntryMetadata<T>(key: string): UndoHistoryMetadataEntry<T> | null;
	setCurrentEntryMetadata<T>(
		key: string,
		value: UndoHistoryMetadataEntry<T>,
	): boolean;
	registerMetadataRestorer<T>(
		key: string,
		restore: (
			value: T | null,
			context: UndoHistoryMetadataRestoreContext,
		) => void,
	): Unsubscribe;
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
	scope?: DocumentScope;
}

export type CommitEventSource =
	| "apply"
	| "remote"
	| "undo"
	| "redo"
	| "stream";

/** Dropped ops and validation failures for one commit (`06-commit-pipeline.md`). */
export type Diagnostic = DiagnosticEvent;

export type { SelectionRecord };

export interface CommitEvent {
	readonly commitId: number;
	readonly origin: StructuredOpOrigin;
	readonly summary: ChangeSummary;
	readonly selectionBefore: SelectionRecord;
	readonly selectionAfter: SelectionRecord;
	readonly source: CommitEventSource;
	readonly diagnostics: readonly Diagnostic[];
}

// ── Schema Engine ───────────────────────────────────────────

export interface SchemaEngine {
	markDirty(blockId: string): void;
	normalizeDirty(): void;
	normalizeAll(): void;
	deferBlock(blockId: string): void;
	undeferBlock(blockId: string): void;
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
	| "MISSING_BLOCK_MAP_KEY"
	| "INVALID_SUBDOCUMENT";
	blockId?: string;
	message: string;
	severity: "error" | "warning";
}

// ── Editor Events ───────────────────────────────────────────

export interface PenEventMap {
	commit: (event: CommitEvent) => void;
	change: (events: CRDTEvent[]) => void;
	documentCommit: (event: DocumentCommitEvent) => void;
	historyApplied: (event: HistoryAppliedEvent) => void;
	decorationsChange: (generation: number) => void;
	selectionChange: (record: SelectionRecord) => void;
	diagnostic: (event: DiagnosticEvent) => void;
	"crdt:corruption": (errors: DocumentValidationError[]) => void;
	"crdt:recovered": (method: "snapshot" | "repair") => void;
}

// ── Hook Priority Constants ─────────────────────────────────

export const HOOK_PRIORITY_AUTH = 100;
export const HOOK_PRIORITY_SUGGEST = 200;
export const HOOK_PRIORITY_INPUT_RULE = 300;
export const HOOK_PRIORITY_DEFAULT = 500;

// ── Editor Options ──────────────────────────────────────────

export interface EditorPresetContext {
	schema: SchemaRegistry;
	documentProfile: DocumentProfile;
}

export interface EditorPresetResult {
	extensions?: Extension[];
	schema?: SchemaRegistry;
}

export interface EditorPreset {
	resolve(context: EditorPresetContext): EditorPresetResult;
}

export interface CreateEditorOptions {
	schema?: SchemaRegistry;
	preset?: EditorPreset;
	extensions?: Extension[];
	crdt?: CRDTAdapter;
	assets?: AssetProvider;
	document?: CRDTDocument;
	documentSession?: DocumentSession;
	documentScopeId?: string;
	documentProfile?: DocumentProfile;
	editorViewMode?: EditorViewMode;
	locale?: string;
	messages?: Partial<MessageCatalog>;
	a11yLabel?: A11yLabel;
}

// ── Command Context ─────────────────────────────────────────

export interface CommandContext {
	editor: Editor;
	selection: SelectionState;
	activeBlock: BlockHandle | null;
}

export interface InlineCompletionSuggestion {
	id: string;
	blockId: string;
	offset: number;
	text: string;
	type: "inline" | "block";
	blockType?: string;
	props?: Record<string, unknown>;
	previewBlocks?: readonly InlineCompletionPreviewBlock[];
	accept?: (editor: Editor, suggestion: InlineCompletionSuggestion) => boolean;
}

export interface InlineCompletionPreviewBlock {
	id: string;
	text: string;
	blockType?: string;
	props?: Record<string, unknown>;
}

export interface InlineCompletionState {
	visibleSuggestion: InlineCompletionSuggestion | null;
}

export interface InlineCompletionController {
	getState(): InlineCompletionState;
	subscribe(listener: () => void): () => void;
	showSuggestion(suggestion: InlineCompletionSuggestion): void;
	dismissSuggestion(): void;
	acceptSuggestion(): boolean;
	hasVisibleSuggestion(): boolean;
	buildDecorations(): readonly Decoration[];
	destroy(): void;
}

// ── Editor Interface ────────────────────────────────────────

export interface TextStreamWriter {
	append(text: string, marks?: Record<string, unknown>): void;
	splice(from: number, to: number, text: string): void;
	readonly position: Point;
	flush(): void;
	close(): void;
	abort(): void;
}

export interface OpenTextStreamOptions {
	origin: OpOrigin;
	flushIntervalMs?: number;
	deferNormalization?: boolean;
}

export interface Editor {
	apply(ops: DocumentOp[], options?: ApplyOptions): void;
	openTextStream(
		target: { blockId: string },
		options: OpenTextStreamOptions,
	): TextStreamWriter;
	loadDocument(doc: CRDTDocument): void;

	onBeforeApply(
		hook: (ops: DocumentOp[], options: ApplyOptions) => DocumentOp[],
		options?: { priority?: number },
	): Unsubscribe;
	facet<F extends Facet<unknown, unknown>>(facet: F): FacetOutput<F>;
	whenReady(): Promise<void>;

	readonly schema: SchemaRegistry;
	readonly selection: SelectionState;
	/** CRDT-relative positions that survive commits (AN1–AN14). */
	readonly anchors: EditorAnchors;
	readonly documentState: DocumentState;
	readonly internals: EditorInternals;
	readonly lastChangeSummary: ChangeSummary | null;
	readonly clientId: number;
	readonly documentScope: DocumentScope;
	readonly documentProfile: DocumentProfile;
	readonly editorViewMode: EditorViewMode;

	blocks(type?: string): Iterable<BlockHandle>;
	getBlock(blockId: string): BlockHandle | null;
	firstBlock(): BlockHandle | null;
	lastBlock(): BlockHandle | null;
	blockCount(): number;
	getBlockRevision(blockId: string): number;

	setSelection(
		selection: SelectionState,
		options?: { origin?: SelectionOrigin },
	): void;
	getSelection(): SelectionState;
	selectBlock(blockId: string): void;
	selectBlocks(blockIds: string[]): void;
	selectCell(blockId: string, row: number, col: number): void;
	selectCellRange(
		blockId: string,
		anchor: { row: number; col: number },
		head: { row: number; col: number },
	): void;
	selectText(blockId: string, from: number, to: number): void;
	selectTextRange(
		anchor: { blockId: string; offset: number },
		focus: { blockId: string; offset: number },
	): void;
	selectAll(): void;

	getSelectedText(): string;
	getSelectedBlocks(): BlockHandle[];
	replaceSelection(content: string | Block[]): void;
	deleteSelection(options?: ApplyOptions): void;

	requestDecorationUpdate(): void;
	getDecorations(): DecorationSet;
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
	/**
	 * Deactivates extensions and tears down observation. Does not destroy an
	 * attached field editor — hosts own that call. The returned promise
	 * settles when queued teardown finishes; callers that ignore it stay
	 * correct.
	 */
	destroy(): Promise<void>;
}

export interface EditorInternals {
	readonly adapter: CRDTAdapter;
	readonly crdtDoc: CRDTDocument;
	readonly doc: PenDocument;
	readonly engine: SchemaEngine;
	readonly awareness: Awareness | null;
	readonly documentSession: DocumentSession | null;
	readonly documentScope: DocumentScope;
	readonly viewId: string;
	emit<K extends keyof PenEventMap>(
		event: K,
		...args: Parameters<PenEventMap[K]>
	): void;
	hasListeners<K extends keyof PenEventMap>(event: K): boolean;
	onApplyBoundary(
		hook: (event: {
			phase: "before" | "after";
			ops: readonly DocumentOp[];
			origin: OpOrigin;
			applied: boolean;
		}) => void,
	): Unsubscribe;
	onPipelinePhase(listener: (phase: PipelinePhase) => void): Unsubscribe;
	getSlot<T>(key: string): T | undefined;
	setSlot: (key: string, value: unknown) => void;
	assignSlot: (key: string, value: unknown) => void;
	getBlockText(blockId: string): unknown;
	getCellText(blockId: string, row: number, col: number): unknown;
}
