// ── Branded IDs ─────────────────────────────────────────────
export {
	type BlockId,
	type AppId,
	type ZoneId,
	type DocId,
	blockId,
	appId,
	zoneId,
	docId,
} from "./ids.js";

// ── Utility ─────────────────────────────────────────────────
export type { Unsubscribe, Spacing, BorderDef } from "./utility.js";

// ── Block ───────────────────────────────────────────────────
export type {
	Block,
	App,
	Range,
	AppPlacement,
	AnchorPosition,
} from "./block.js";

// ── Selection ───────────────────────────────────────────────
export type {
	SelectionState,
	TextSelection,
	BlockSelection,
	AppSelection,
	CellSelection,
} from "./selection.js";

// ── Document Range ──────────────────────────────────────────
export type { DocumentRange } from "./documentRange.js";

// ── Layout ──────────────────────────────────────────────────
export type { LayoutSchema, LayoutProps, LayoutChildProps } from "./layout.js";

// ── Input ───────────────────────────────────────────────────
export type {
	KeyBinding,
	KeyBindingContext,
	InputRule,
	InputRuleHandler,
	InputRuleContext,
} from "./input.js";

// ── Operations ──────────────────────────────────────────────
export type {
	DocumentOp,
	OpOrigin,
	ApplyOptions,
	Position,
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
	InsertTableRowOp,
	DeleteTableRowOp,
	InsertTableColumnOp,
	DeleteTableColumnOp,
	MergeTableCellsOp,
	SplitTableCellOp,
	SetMetaOp,
	CreateAppOp,
	UpdateAppOp,
	DeleteAppOp,
	SetSelectionOp,
} from "./ops.js";

// ── Stream ──────────────────────────────────────────────────
export type {
	PenStreamPart,
	PenStreamRequest,
	GenStartPart,
	GenDeltaPart,
	GenEndPart,
	BlockInsertPart,
	BlockUpdatePart,
	BlockDeletePart,
	BlockMovePart,
	LayoutUpdatePart,
	AppCreatePart,
	AppUpdatePart,
	AppDeletePart,
	StepStartPart,
	StepEndPart,
	ToolInputStartPart,
	ToolInputDeltaPart,
	ToolInputAvailablePart,
	ToolOutputPart,
	ToolErrorPart,
	DataPart,
	ErrorPart,
	AbortPart,
	PingPart,
	DonePart,
} from "./stream.js";

// ── Schema ──────────────────────────────────────────────────
export {
	type PropSchema,
	type ContentType,
	type BlockDisplay,
	type BlockSchema,
	type InlineSchema,
	type AppSchema,
	type SchemaRegistry,
	type ComposableSchema,
	type FieldEditorType,
	isNestedContent,
} from "./schema.js";

// ── Handles ─────────────────────────────────────────────────
export type { BlockHandle, AppHandle } from "./handles.js";

// ── Field Editor ────────────────────────────────────────────
export type {
	FieldEditor,
	FieldEditorFactory,
	FieldEditorContext,
	InputBackend,
	StreamingTarget,
} from "./fieldEditor.js";

// ── CRDT ────────────────────────────────────────────────────
export type {
	CRDTAdapter,
	CRDTDocument,
	PenDocument,
	CRDTUndoManager,
	CRDTUndoStackItem,
	CRDTArray,
	CRDTMap,
	Awareness,
	AwarenessChangeEvent,
	CRDTEvent,
	GenerationZone,
	UndoManagerOptions,
	AttributionRange,
} from "./crdt.js";

// ── Extension ───────────────────────────────────────────────
export type {
	Extension,
	ExtensionStateSpec,
	ServerExtensionContext,
	ClientExtensionContext,
} from "./extension.js";

// ── Editor ──────────────────────────────────────────────────
export {
	type Editor,
	type EditorInternals,
	type CreateEditorOptions,
	type DocumentState,
	type PenEventMap,
	type UndoManager,
	type UndoHistoryRestore,
	type HistoryAppliedEvent,
	type DocumentCommitEvent,
	type SchemaEngine,
	type DiagnosticEvent,
	type DocumentValidationError,
	type CommandContext,
	HOOK_PRIORITY_AUTH,
	HOOK_PRIORITY_SUGGEST,
	HOOK_PRIORITY_INPUT_RULE,
	HOOK_PRIORITY_DEFAULT,
} from "./editor.js";

// ── Tools ───────────────────────────────────────────────────
export type {
	ToolServer,
	ToolDefinition,
	ToolContext,
	ToolSchema,
	ModelAdapter,
	ModelStreamEvent,
	ModelMessage,
	ModelMessagePart,
} from "./tools.js";

// ── Persistence ─────────────────────────────────────────────
export type {
	PenPersistence,
	VersionMetadata,
	VersionEntry,
	AssetRef,
	AssetUploadOptions,
	AssetProvider,
} from "./persistence.js";

// ── Decorations ─────────────────────────────────────────────
export type {
	Decoration,
	InlineDecoration,
	BlockDecoration,
	AppDecoration,
	DecorationSet,
	PositionMapping,
} from "./decorations.js";

// ── Transport ───────────────────────────────────────────────
export type { PenTransport, ServerConfig } from "./transport.js";

// ── Serialization ───────────────────────────────────────────
export type {
	MarkdownNode,
	XMLElement,
	Exporter,
	ExportOptions,
	Importer,
	ImportOptions,
} from "./serialization.js";

// ── Rendering ───────────────────────────────────────────────
export type { BlockRenderContext, BlockRenderer } from "./rendering.js";

// ── Suggestions ─────────────────────────────────────────────
export type { BlockSuggestion } from "./suggestions.js";
