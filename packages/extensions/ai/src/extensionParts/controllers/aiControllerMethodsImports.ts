export {
	createDecorationSet,
	ensureInlineCompletionController,
	getInlineCompletionController as getInlineCompletionControllerFromCore,
} from "@pen/core";
export {
	buildDocumentWriteOps,
	getDocumentToolRuntime,
} from "@pen/document-ops";
export type {
	Decoration,
	DocumentOp,
	Editor,
	Extension,
	HistoryAppliedEvent,
	KeyBinding,
	ModelAdapter,
	ModelOperationScopedRangeTarget,
	ModelOperationSelectionTarget,
	OpOrigin,
	SelectionState,
	StreamingTarget,
	TextSelection,
	ToolDefinition,
	ToolRuntime,
	UndoHistoryMetadataController,
} from "@pen/types";
export {
	AI_AUTOCOMPLETE_CONTROLLER_SLOT,
	AI_CONTROLLER_SLOT as CORE_AI_CONTROLLER_SLOT,
	AI_INLINE_HISTORY_SLOT as CORE_AI_INLINE_HISTORY_SLOT,
	AI_REVIEW_CONTROLLER_SLOT as CORE_AI_REVIEW_CONTROLLER_SLOT,
	INLINE_COMPLETION_SLOT as CORE_INLINE_COMPLETION_SLOT,
	defineExtension,
	getOpOriginType,
	isScopedSelectionTarget,
	renderSelectionTargetBlockText,
	resolveSelectionTargetBlockIds,
	shouldExposeBlockInTooling,
	UNDO_HISTORY_METADATA_CONTROLLER_SLOT_KEY,
	usesInlineTextSelection,
} from "@pen/types";
export { runAgenticLoop } from "../../agentic/loop";
export { defaultAICommands } from "../../commands/defaultCommands";
export { AICommandRegistry } from "../../commands/registry";
export { AIInlineHistoryService, AIReviewService } from "../../controllers";
export { buildAffectedRangeDecorations } from "../../decorations/affectedRange";
export { buildGenerationZoneDecorations } from "../../decorations/generationZone";
export { buildTrackChangesDecorations } from "../../decorations/trackChanges";
export { buildAIReviewPresentationDecorations } from "../../review/reviewPresentation";
export { getBlockAdapter } from "../../runtime/blockAdapters";
export type {
	AIApplyStrategy,
	AIContentFormat,
	AITargetKind,
} from "../../runtime/contracts";
export { resolveDocumentInsertionAnchor } from "../../runtime/documentInsertionAnchor";
export {
	MARKDOWN_FAST_APPLY_ROOT_TAG,
	normalizeFlowMarkdownOutput,
} from "../../runtime/flowMarkdown";
export {
	applyMarkdownFastApply,
	parseMarkdownFastApplyContract,
} from "../../runtime/markdownFastApply";
export { parseMarkdownPatchPlanContract } from "../../runtime/markdownPatchPlan";
export { buildMutationReceipt } from "../../runtime/mutationReceipt";
export { buildDocumentMutationPlanExecution } from "../../runtime/planExecutor";
export { validateDocumentMutationPlanShape } from "../../runtime/planValidation";
export type { StructuralReviewItem } from "../../runtime/reviewArtifacts";
export {
	buildStructuralReviewItems,
	removeStructuralReviewItemPlan,
	selectStructuralReviewItemPlan,
} from "../../runtime/reviewArtifacts";
export {
	classifyPromptIntent,
	refineRouteWithNavigator,
	routeAIRequest,
} from "../../runtime/router";
export {
	isClearDocumentPrompt,
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
	isWholeDocumentRewritePrompt,
} from "../../runtime/promptTargeting";
export { SuggestedAIOperationRunner } from "../../runtime/suggestedOperationRunner";
export { compileStructuredIntentToPlan } from "../../runtime/structuredIntentCompiler";
export {
	buildPlannerPrompt,
	parseStructuredPlanPreview,
	parseStructuredPlanResult,
	resolveExecutionMode,
} from "../../runtime/structuredPlanner";
export {
	buildGenerationStructuredPreviewState,
	buildStructuredPreviewPatchOperations,
} from "../../runtime/structuredPreview";
export {
	acceptAllSuggestions,
	acceptSuggestion,
	acceptSuggestions,
	rejectAllSuggestions,
	rejectSuggestion,
	rejectSuggestions,
} from "../../suggestions/acceptReject";
export { readAllSuggestions } from "../../suggestions/persistent";
export {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestMode,
	shouldBypassSuggestMode,
	SUGGESTION_RESOLUTION_ORIGIN,
} from "../../suggestions/suggestMode";
export type {
	AICommandBinding,
	AICommandContext,
	AICommandExecutionOptions,
	AIContextualPromptRect,
	AIController,
	AIControllerState,
	AIExtensionConfig,
	AIExternalInlineTurnResult,
	AIInlineCompletionController,
	AIInlineHistoryController,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AIMutationReceipt,
	AIReviewController,
	AIRequestedOperation,
	AISession,
	AISessionMetrics,
	AISessionResolution,
	AISessionSelectionSnapshot,
	AISessionTarget,
	AIStreamingReviewPreviewInput,
	AIStreamingReviewPreviewTarget,
	AIStreamEvent,
	AISurface,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
	FastApplyDebugState,
	GenerationState,
	GenerationStructuredPreviewState,
	PersistentTextSuggestion,
	PersistentSuggestion,
	ResolvedEditProposal,
	ResolvedEditTarget,
} from "../../types";
export {
	resolveGenerationRequestMode,
	isLocalRequestedOperation,
	EMPTY_TOOL_RUNTIME,
	MAX_STREAM_EVENTS,
	AI_UNDO_HISTORY_METADATA_KEY,
	resolveOrderedReviewItems,
	sortReviewItemsForRemoval,
	compareReviewItemRemovalOrder,
	resolveActiveBlockId,
	readModelId,
	supportsStructuredIntent,
	createAIStreamEvent,
	resolvePromptTarget,
	resolveSessionTarget,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
	resolveContextualPromptAnchor,
	resolveContextualPromptState,
	createInlineHistorySnapshot,
	cloneSessionTarget,
	cloneInlineHistorySessions,
	recreateTextSelection,
	resolveSelectionSnapshotBlockRange,
	resolveSelectionSnapshotRangeStart,
	resolveSelectionSnapshotRangeEnd,
	resolveRequestedOperationForSession,
	resolveLocalOperationContentFormat,
	canUseLocalBlockTextOperation,
	canReuseBottomChatSessionOperation,
	resolveResolvedEditTargetFromRequestedOperation,
	areResolvedEditTargetsEqual,
	buildSessionExecutionPrompt,
	createRewriteSelectionOperation,
	createRewriteSelectionOperationFromResolvedTarget,
	createRewriteBlockOperation,
	createContinueBlockOperation,
	createDocumentTransformOperation,
	resolvePreviousGeneratedBlockIds,
	shouldReplacePreviousGeneratedBlocks,
	resolveReplacementDeleteBlockIds,
	createResolvedSelectionEditTarget,
	createResolvedScopedEditTarget,
	createResolvedEditProposal,
	resolveResolvedEditProposal,
	resolveSelectionForRequestedOperation,
	resolveFullBlockTextSelection,
	resolveDocumentBlockRangeSelection,
	resolveDocumentTitleSelection,
	resolveDocumentParagraphSelection,
	parseParagraphReference,
	resolveWordOrdinal,
	resolveBlockIdForRequestedOperation,
	resolveRequestedOperationConflict,
	resolveContinueInsertionOffset,
	createSelectionSignature,
	resolveSessionSelectionTarget,
	resolveLiveInlineSelectionTarget,
	resolvePendingInlineSelectionTarget,
	resolveAcceptedInlineSelectionTarget,
	shouldCloseInlineSessionPrompt,
	closeInlineSessionPrompt,
	createDefaultSessionFastApplyMetrics,
	accumulateSessionFastApplyMetrics,
	selectionMatchesSnapshot,
	resolveSessionSelectionSnapshots,
	sessionTargetMatches,
	sessionSelectionMatches,
	resolveSessionBlockId,
	resolveBlockInsertionOffset,
	appendUniqueString,
	areSuggestionsEqual,
	areAIControllerStatesEqual,
	areGenerationsEqual,
	areSessionsEqual,
	areInlineHistorySnapshotsEqual,
	didInlineHistoryCheckpointChange,
	buildInlineHistoryCheckpoint,
	countSettledInlineTurns,
	hasStreamingInlineTurns,
	resolveInlineShortcutHistoryState,
	areInlineShortcutHistoryStatesEqual,
	shouldReplaceInlineShortcutWaypointRepresentative,
	areEphemeralSuggestionsEqual,
	areStringArraysEqual,
	areStructuredValuesEqual,
	buildSelectionReplacementOps,
	sliceInlineDeltasFromOffset,
	resolveSelectionText,
	shouldReplaceEmptyMarkdownTarget,
	shouldTrimLeadingBlankBlockGenerationText,
	trimLeadingBlankBlockGenerationText,
	isVisuallyEmptyInlineText,
} from "../extensionHelpers";
export type {
	GenerationTarget,
	GenerationExecutionContext,
	AIInlineHistoryRestoreRequest,
	AIInlineShortcutHistoryPhase,
	AIInlineShortcutHistoryState,
	AIInlineShortcutHistoryWaypoint,
	AIStreamEventInput,
} from "../extensionHelpers";
