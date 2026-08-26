// getAIInlineCompletionController is the AI-package accessor.
// @input/pen-core already publishes getInlineCompletionController.
export {
	aiExtension,
	AI_EXTENSION_NAME,
	getAIController,
	getAIInlineCompletionController,
	getAIInlineHistoryController,
	getAIReviewController,
} from "./extension";

export { runAgenticLoop } from "./agentic/loop";
export { AI_TOOL_RESULT_MAX_CHARS } from "./runtime/stepJournal";
export {
	aiEgressFacet,
	aiEgressExtension,
	filterAIRequest,
	streamThroughEgress,
	AI_FEATURE_CONTENT,
	AI_EGRESS_INVENTORY_CODE,
	AI_REQUEST_REFUSED_CODE,
} from "./egress";
export { AICommandRegistry } from "./commands/registry";
export { defaultAICommands } from "./commands/defaultCommands";
export {
	AI_EXECUTION_MODES,
	AI_APPLY_STRATEGIES,
	AI_BLOCK_ADAPTER_IDS,
	AI_BLOCK_CLASSES,
	AI_PLANNER_MODES,
	AI_STRUCTURED_LANES,
	AI_TARGET_KINDS,
	AI_TRANSPORT_KINDS,
} from "./runtime/contracts";
export type {
	AIBlockAdapterId,
	AIApplyStrategy,
	AIBlockClass,
	AIMutationPreference,
	AITargetKind,
	AIPlannerMode,
	AIExecutionMode,
	AIStructuredLane,
	AITransportKind,
} from "./runtime/contracts";
export {
	getBlockAdapter,
	listBlockAdapters,
	resolveBlockAdapter,
	resolveBlockAdapterContentFormat,
} from "./runtime/blockAdapters";
export { DOCUMENT_MUTATION_PLAN_KINDS } from "./runtime/planTypes";
export {
	PLAN_VALIDATION_SEVERITIES,
	isDocumentMutationPlan,
	validateDocumentMutationPlanShape,
} from "./runtime/planValidation";
export {
	buildStructuredIntentModelPrompt,
	getStructuredIntentOutputSchema,
	parseStructuredIntentRequestPrompt,
} from "./runtime/structuredIntent";

export {
	acceptSuggestion,
	rejectSuggestion,
	acceptAllSuggestions,
	rejectAllSuggestions,
} from "./suggestions/acceptReject";
export {
	readAllSuggestions,
	readSuggestionsFromBlock,
	readBlockSuggestionMeta,
	createSuggestionMark,
} from "./suggestions/persistent";
export {
	AI_SESSION_SUGGESTION_ORIGIN,
	SUGGESTION_RESOLUTION_ORIGIN,
} from "./suggestions/suggestMode";
export { applySuggestedAIOperations } from "./suggestions/applySuggestedAIOperations";

export type {
	AIExtensionConfig,
	AIEditStreaming,
	AIStatus,
	AIContextualPromptAnchor,
	AIContextualPromptAnchorKind,
	AIContextualPromptAnchorStatus,
	AIContextualPromptComposerState,
	AIContextualPromptRect,
	AIContextualPromptState,
	AISession,
	AISessionAnchor,
	AIStreamingReviewPreview,
	AIStreamingReviewPreviewInput,
	AIStreamingReviewPreviewTarget,
	AISessionMetrics,
	AISessionFastApplyMetrics,
	AISessionPrompt,
	AISessionStatus,
	AISessionTarget,
	AISurface,
	AIAwarenessState,
	AIExternalInlineTurnResult,
	AgenticStep,
	GenerationState,
	EphemeralSuggestion,
	PersistentSuggestion,
	PersistentTextSuggestion,
	PersistentBlockSuggestion,
	BlockSuggestionMeta,
	AICommandBinding,
	AICommandContext,
	AICommandGuard,
	AICommandExecutionOptions,
	AIControllerState,
	AIController,
	AIInlineCompletionState,
	AIInlineCompletionController,
	AIInlineHistoryDirection,
	AIInlineHistoryController,
	AIReviewController,
	AIPromptTarget,
	AISessionResolution,
	AIContentFormatOptions,
	AISuggestionPresentation,
	GenerationPlanState,
	GenerationTargetKind,
	StructuredGenerationDebugState,
	FastApplyDebugState,
	AIWorkingSetRetrievedSpan,
	AIStreamEvent,
	AIStreamEventType,
	GenerationStructuredPreviewState,
	StructuredPreviewPatchOperation,
	AIMutationReceipt,
	AIMutationReceiptEvidence,
	AIMutationReceiptStatus,
} from "./types";
export type {
	ApplySuggestedAIOperationsOptions,
	ApplySuggestedAIOperationsResult,
} from "./suggestions/applySuggestedAIOperations";
export type {
	DocumentMutationPlan,
	DocumentMutationPlanKind,
} from "./runtime/planTypes";
export type {
	PlanValidationContext,
	PlanValidationIssue,
	PlanValidationResult,
	PlanValidationSeverity,
} from "./runtime/planValidation";
export type {
	StructuralReviewItem,
	StructuralReviewComparisonRow,
} from "./runtime/reviewArtifacts";
