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
} from "./ids";

// ── Utility ─────────────────────────────────────────────────
export type { Unsubscribe, Spacing, BorderDef } from "./utility";

// ── Collaboration ───────────────────────────────────────────
export type {
	ConnectionState,
	MultiplayerSession,
	MultiplayerSessionContext,
} from "./collaboration";

// ── Block ───────────────────────────────────────────────────
export type { Block, App, Range, AppPlacement, AnchorPosition } from "./block";

// ── Selection ───────────────────────────────────────────────
export type {
	SelectionState,
	TextSelection,
	BlockSelection,
	AppSelection,
	CellSelection,
} from "./selection";

// ── Document Range ──────────────────────────────────────────
export type { DocumentRange } from "./documentRange";

// ── Layout ──────────────────────────────────────────────────
export type { LayoutSchema, LayoutProps, LayoutChildProps } from "./layout";

// ── Input ───────────────────────────────────────────────────
export type {
	KeyBinding,
	KeyBindingContext,
	InputRule,
	InputRuleHandler,
	InputRuleContext,
} from "./input";

// ── Facets ──────────────────────────────────────────────────
export type {
	Precedence,
	FacetSpec,
	Facet,
	FacetDependency,
	FacetProvider,
	FacetOutput,
	DefineFacet,
} from "./facets";

// ── Commands ────────────────────────────────────────────────
export type {
	Command,
	CommandResult,
	CommandHandler,
	CommandHandlerRegistration,
	DefineCommand,
	CommandHandlerProvider,
} from "./commands";

// ── Operations ──────────────────────────────────────────────
export type {
	DocumentOp,
	OpOriginType,
	OpOrigin,
	StructuredOpOrigin,
	MutationGroupMetadata,
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
	InsertTableCellTextOp,
	DeleteTableCellTextOp,
	FormatTableCellTextOp,
	UpdateTableColumnsOp,
	SetMetaOp,
	CreateAppOp,
	UpdateAppOp,
	DeleteAppOp,
	SetSelectionOp,
	StreamOpenOp,
} from "./ops";
export {
	MUTATION_GROUP_METADATA_KEY,
	createMutationGroupMetadata,
	getApplyOptionsGroupId,
	getOpOriginGroupId,
	getOpOriginType,
} from "./ops";

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
} from "./stream";
export { PEN_STREAM_PROTOCOL_VERSION } from "./stream";

// ── Schema ──────────────────────────────────────────────────
export {
	type PropSchema,
	type ContentType,
	type BlockDisplay,
	type BlockAuthoring,
	type BlockSelectionRole,
	type FlowBlockCapability,
	type ImportInlineMark,
	type ImportContentSource,
	type BlockImportMatch,
	type BlockSchema,
	type InlineSchema,
	type AppSchema,
	type SchemaRegistry,
	type ComposableSchema,
	type FieldEditorType,
	isNestedContent,
} from "./schema";

// ── Handles ─────────────────────────────────────────────────
export type {
	BlockHandle,
	AppHandle,
	InlineDelta,
	InlineNodeDeltaInsert,
	TableCellHandle,
	TableColumnSchema,
	TableRowHandle,
} from "./handles";
export type {
	BlockCapabilityKey,
	BlockCapabilityMap,
	TableBlockHandle,
} from "./capabilities";

// ── Columns ─────────────────────────────────────────────────
export type {
	ColumnType,
	SelectOption,
	NumberFormat,
	DateFormat,
} from "./columns";

// ── Field Editor ────────────────────────────────────────────
export type {
	FieldEditor,
	FieldEditorFocusOptions,
	FieldEditorFocusReason,
	StreamingTarget,
} from "./fieldEditor";
export type {
	FieldEditorBehavior,
	FieldEditorInputMode,
} from "./fieldEditorCapabilities";
export {
	delegatesToGridEditing,
	hasFieldEditorSurface,
	resolveFieldEditorBehavior,
	resolveFieldEditorInputMode,
	supportsInlineInputRules,
	supportsInlineMarks,
	usesInlineTextSelection,
} from "./fieldEditorCapabilities";

// ── CRDT ────────────────────────────────────────────────────
export type {
	CRDTAdapter,
	LoadDocumentOptions,
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
	DocumentProfile,
	DocumentScopeKind,
	DocumentScopeInfo,
	DocumentScope,
	DocumentScopeLookupOptions,
	DocumentScopeReplacementEvent,
	CreateSubdocumentOptions,
	DocumentSessionAttachOptions,
	ReplaceScopeDocumentOptions,
	DocumentSession,
} from "./crdt";

// ── Extension ───────────────────────────────────────────────
export type {
	Extension,
	ExtensionStateSpec,
	ServerExtensionContext,
	ClientExtensionContext,
} from "./extension";

// ── Editor ──────────────────────────────────────────────────
export {
	type Editor,
	type EditorInternals,
	type TextStreamWriter,
	type OpenTextStreamOptions,
	type PipelinePhase,
	type CreateEditorOptions,
	type EditorPreset,
	type EditorPresetContext,
	type EditorPresetResult,
	type DocumentState,
	type PenEventMap,
	type UndoManager,
	type UndoHistoryMetadataEntry,
	type UndoHistoryMetadataRestoreContext,
	type UndoHistoryMetadataController,
	type UndoHistoryRestore,
	type HistoryAppliedEvent,
	type DocumentCommitEvent,
	type CommitEvent,
	type CommitEventSource,
	type Diagnostic,
	type SelectionRecord,
	type SchemaEngine,
	type DiagnosticEvent,
	type DocumentValidationError,
	type CommandContext,
	type InlineCompletionPreviewBlock,
	type InlineCompletionSuggestion,
	type InlineCompletionState,
	type InlineCompletionController,
	type EditorViewMode,
	type InteractionModel,
	HOOK_PRIORITY_AUTH,
	HOOK_PRIORITY_SUGGEST,
	HOOK_PRIORITY_INPUT_RULE,
	HOOK_PRIORITY_DEFAULT,
} from "./editor";

// ── Tools ───────────────────────────────────────────────────
export {
	isAsyncIterable,
	resolveToolExecution,
	collectToolExecutionOutput,
} from "./tools";
export type {
	ToolRegistry,
	ToolRuntime,
	ToolExecutionResult,
	ToolDefinition,
	ToolContext,
	ToolSchema,
	ModelAdapter,
	ModelOperationApplyPolicy,
	ModelOperationBlockTarget,
	ModelOperationDocumentTarget,
	ModelOperationScopedRangeTarget,
	ModelOperationKind,
	ModelOperationProvenance,
	ModelOperationSelectionTarget,
	ModelRequestedOperation,
	ModelStreamEvent,
	ModelMessage,
	ModelMessagePart,
} from "./tools";

// ── AI request ──────────────────────────────────────────────
export type { AIRequestContext, AIRequestFilter } from "./aiRequest";

// ── Accessibility ───────────────────────────────────────────
export type { BlockA11ySpec } from "./a11y";
export type { A11yMessageKey, A11yMessageCatalog } from "./a11yMessages";

// ── Persistence ─────────────────────────────────────────────
export type {
	PenPersistence,
	VersionMetadata,
	VersionEntry,
	AssetRef,
	AssetUploadOptions,
	AssetProvider,
} from "./persistence";

// ── Document format ─────────────────────────────────────────
export {
	PEN_DOCUMENT_FORMAT,
	PEN_FORMAT_METADATA_KEY,
	DOCUMENT_PROFILE_METADATA_KEY,
	MIGRATION_LEDGER_METADATA_KEY,
	RESERVED_METADATA_KEYS,
	IMPLICIT_V1_FORMAT_STAMP,
	PenDocumentUnreadableError,
} from "./format";
export type { PenFormatStamp, ReservedMetadataKey } from "./format";

// ── Decorations ─────────────────────────────────────────────
export { INLINE_COMPLETION_VISIBLE_BLOCK_ATTRIBUTE } from "../constants/decorations";
export type {
	Decoration,
	InlineDecoration,
	BlockDecoration,
	AppDecoration,
	DecorationSet,
	PositionMapping,
} from "./decorations";
export { DECORATION_OMIT_FROM_RENDER_ATTRIBUTE } from "./decorations";

// ── Transport ───────────────────────────────────────────────
export type { PenTransport, ServerConfig } from "./transport";

// ── Clipboard ───────────────────────────────────────────────
export { PEN_CLIPBOARD_PAYLOAD_VERSION } from "./clipboard";
export type {
	PenClipboardBlock,
	PenClipboardDelta,
	PenClipboardPayload,
} from "./clipboard";

// ── Serialization ───────────────────────────────────────────
export type {
	MarkdownNode,
	HTMLImportElement,
	HTMLImportNode,
	HTMLImportTextNode,
	XMLElement,
	Exporter,
	ExportOptions,
	Importer,
	ImportOptions,
	ImportResult,
} from "./serialization";

// ── Rendering ───────────────────────────────────────────────
export type { BlockRenderContext, BlockRenderer } from "./rendering";

// ── Suggestions ─────────────────────────────────────────────
export type { BlockSuggestion } from "./suggestions";

// ── Change summaries ────────────────────────────────────────
export type {
	Assoc,
	PointMapMode,
	DefaultAssoc,
	DefaultPointMapMode,
	Point,
	TextSplice,
	BlockTextChange,
	StructuralChange,
	ChangeSummary,
	SummaryLog,
} from "./changes";
