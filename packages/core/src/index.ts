import {
	filterOpsForDocumentProfile,
	filterPendingBlocksForDocumentProfile,
	createImportResult,
	isContinuousTextFlowCapability,
	normalizePendingBlocksForImport,
	reportPendingBlockImportViolations,
	reportPendingBlockProfileViolations,
	resolveBlockFlowCapability,
	shouldAllowDirectBlockPaste,
	shouldAllowFlowInsertionInSlashMenu,
	shouldFallbackMixedSelectionToBlock,
	shouldForceBlockScopedSelectAll,
} from "./editor/profilePolicy";

// Contracts live in @input/pen-types.
// Keep @input/pen-core focused on runtime entrypoints and advanced internals.

// Schema engine runtime
export { SchemaRegistryImpl, mergeSchemas } from "./schema/registry";
export type { SchemaRegistryConfig } from "./schema/registry";

export {
	SchemaEngineImpl,
	deepEqual,
	sortDeltaAttributes,
} from "./schema/normalize";

export { createBlockHandle, createAppHandle } from "./schema/handles";

export { suggestion } from "./schema/system-marks/suggestion";

// Editor runtime
export { createEditor, createHeadlessEditor } from "./editor/editor";
export { createTextStreamWriter } from "./editor/textStream";
export type { CreateTextStreamWriterOptions } from "./editor/textStream";
export type { CreateHeadlessEditorOptions } from "./editor/editor";
export {
	createDocumentSession,
	DocumentSessionImpl,
} from "./editor/documentSession";
export { EventEmitter } from "./editor/events";
export {
	createDecorationSet,
	emptyDecorationSet,
	mergeDecorationSets,
} from "./editor/decorations";
export {
	ensureInlineCompletionController,
	getInlineCompletionController,
} from "./editor/inlineCompletion";
export { DocumentStateImpl } from "./editor/documentState";
export { DocumentRangeImpl } from "./editor/range";
export { SelectionManagerImpl } from "./editor/selection";
export { ExtensionManagerImpl } from "./editor/extensionManager";
export { ApplyPipeline } from "./editor/apply";
export {
	APPLY_STORM_CODE,
	APPLY_STORM_QUEUE_LIMIT,
	PIPELINE_PHASES,
} from "./editor/pipelinePhases";
export type { PipelinePhase } from "./editor/pipelinePhases";
export {
	hasIndexedCellSelectionMetadata,
	resolveCellSelectionCoord,
	resolveCellSelectionMatrix,
} from "./editor/cellSelection";
export { getNumberedListItemValue } from "./editor/orderedList";
export {
	createImportResult,
	filterOpsForDocumentProfile,
	filterPendingBlocksForDocumentProfile,
	isContinuousTextFlowCapability,
	normalizePendingBlocksForImport,
	reportPendingBlockImportViolations,
	reportPendingBlockProfileViolations,
	resolveBlockFlowCapability,
	shouldAllowDirectBlockPaste,
	shouldAllowFlowInsertionInSlashMenu,
	shouldFallbackMixedSelectionToBlock,
	shouldForceBlockScopedSelectAll,
};
export type {
	PendingBlockImportPolicyViolation,
	PendingBlockProfilePolicyViolation,
	ProfilePolicyViolation,
} from "./editor/profilePolicy";

// Importer utilities (used by Wave 4 importers)
export { blocksToOps } from "./importerUtils";
export type {
	PendingBlock,
	ImportOptions as ImporterOptions,
} from "./importerUtils";

// Exporter utilities (shared by Wave 4 exporters)
export { buildTableChildren } from "./exporterUtils";

// Document migrations (DUR4)
export { runMigrations } from "./migrations/runMigrations";
export type { DocumentMigration, MigrationReport } from "./migrations/types";

export {
	foldAndNormalize,
	nextGraphemeBoundary,
	nextWordBoundary,
	previousGraphemeBoundary,
	previousWordBoundary,
	wordRangeAt,
} from "./editor/textSegmentation";
export type { WordRange } from "./editor/textSegmentation";

export { defineFacet, createFacetRegistry } from "./facets/registry";
export type {
	FacetRegistry,
	CreateFacetRegistryOptions,
	FacetSettleInput,
} from "./facets/registry";
export {
	keymapFacet,
	beforeApplyFacet,
	decorationsFacet,
	inputRulesFacet,
	commandsFacet,
	readOnlyFacet,
	clipboardFacet,
} from "./facets/coreFacets";
export type {
	Keymap,
	BeforeApplyHook,
	DecorationSource,
	ClipboardHandler,
	CommandHandlerTable,
} from "./facets/coreFacets";
export {
	HOOK_PRIORITIES,
	priorityToPrecedence,
	hookPriorityToPrecedence,
	keyBindingPriorityToPrecedence,
} from "./facets/precedence";
export {
	singleController,
	fieldEditorHostFacet,
	inputRulesEngineFacet,
	undoRestoreControllerFacet,
	undoMetadataControllerFacet,
	undoManagerFacet,
	aiInlineCompletionFacet,
	aiControllerFacet,
	aiInlineHistoryFacet,
	aiReviewControllerFacet,
	aiAutocompleteControllerFacet,
	aiSuggestionsControllerFacet,
	searchControllerFacet,
	multiplayerControllerFacet,
	historyControllerFacet,
	assetProviderFacet,
	documentOpsToolRuntimeFacet,
} from "./facets/controllerFacets";
export {
	SLOT_DEPRECATED_CODE,
	SLOT_DISPOSITION_BY_KEY,
	dispositionForSlot,
} from "./facets/slotAdapter";
export { affectedBlockIdsFromSummary } from "./changes/affectedBlocks";
export { EVENT_DEPRECATED_CODE } from "./editor/commitEvent";
