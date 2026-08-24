import type {
	CommitEvent,
	DocumentOp,
	Editor,
	HistoryAppliedEvent,
	ModelAdapter,
	OpOrigin,
	SelectionState,
	TextSelection,
	ToolRuntime,
	UndoHistoryMetadataController,
} from "@input/pen-types";
import type { AIToolConfirmFn } from "../tools";
import type {
	AIApplyStrategy,
	AIContentFormat,
	AITargetKind,
} from "../runtime/contracts";
import type { PlanValidationContext } from "../runtime/planValidation";
import type { SuggestedAIOperationRunner } from "../runtime/suggestedOperationRunner";
import type { ExternalInlineTurnRegistry } from "../runtime/externalInlineTurnRegistry";
import type {
	AICommandExecutionOptions,
	AIControllerState,
	AIExtensionConfig,
	AIExternalInlineTurnResult,
	AIInlineCompletionController,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AIMutationReceipt,
	AIRequestedOperation,
	AISession,
	AISessionResolution,
	AIStreamEvent,
	AISurface,
	AIWorkingSetEnvelope,
	AIWorkingSetRetrievedSpan,
	FastApplyDebugState,
	GenerationState,
	PersistentSuggestion,
} from "../types";
import type { RequestRouterDecision } from "../runtime/router";
import type { StructuralReviewItem } from "../runtime/reviewArtifacts";
import type {
	AIInlineHistoryRestoreRequest,
	AIInlineShortcutHistoryState,
	AIInlineShortcutHistoryWaypoint,
	GenerationExecutionContext,
	GenerationTarget,
} from "../helpers";

export interface AIControllerMethodHost {
	_editor: Editor;
	_model: ModelAdapter | undefined;
	_maxAgenticSteps: number;
	_allowedMutatingTools: readonly string[];
	_confirmAITool: AIToolConfirmFn | undefined;
	_inlineCompletion: AIInlineCompletionController;
	_suggestedOperationRunner: SuggestedAIOperationRunner;
	_suggestionPresentation: NonNullable<
		AIExtensionConfig["suggestionPresentation"]
	>;
	_state: AIControllerState;
	_suggestions: PersistentSuggestion[];
	_undoHistoryMetadata: UndoHistoryMetadataController | null;
	_externalInlineTurnRegistry: ExternalInlineTurnRegistry;
	_listeners: Set<() => void>;
	_sessionListeners: Set<() => void>;
	_streamEvents: readonly AIStreamEvent[];
	_streamEventListeners: Set<() => void>;
	_abortController: AbortController | null;
	_inlineHistory: AIInlineHistorySnapshot[];
	_inlineHistoryIndex: number;
	_documentVersion: number;
	_contentFormat: {
		blockGeneration: AIContentFormat;
		selectionRewrite: AIContentFormat;
	};
	_pendingInlineHistoryRestore: AIInlineHistoryRestoreRequest | null;
	_isRestoringInlineHistory: boolean;

	_setState(partial: Partial<AIControllerState>): void;
	_updateSession(
		sessionId: string,
		partial: Partial<AISession>,
	): void;
	_updateSessionTurn(
		sessionId: string,
		turnId: string,
		overrides: Partial<AISession["turns"][number]>,
	): void;
	_syncSuggestionsFromDocument(): boolean;
	_syncSessionsFromDocument(): boolean;
	_syncSuggestionResolutionState(): void;
	_emit(): void;
	_setStreamEvents(events: readonly AIStreamEvent[]): void;
	_appendStreamEvent(event: AIStreamEvent): void;
	_emitStreamEvents(): void;
	_resolveSessionTurn(
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
		options?: { finalizeSession?: boolean },
	): boolean;
	getActiveSession(): AISession | null;
	startSession(input: {
		surface: AISession["surface"];
		target?: "auto" | "selection" | "block" | "document";
	}): AISession;
	resolveSessionTurn(
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
	): boolean;
	clearStreamingReviewPreview(sessionId?: string): void;
	cancelActiveGeneration(): void;
	handleExternalCommit(events: readonly CommitEvent[]): void;
	_executeGeneration(
		prompt: string,
		target: GenerationTarget,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState>;
	_executeLocalOperation(input: {
		prompt: string;
		target: GenerationTarget;
		blockId: string;
		commandId?: string;
		context?: GenerationExecutionContext;
		abortController: AbortController;
		baselineSuggestionIds: Set<string>;
		operation: AIRequestedOperation;
	}): Promise<GenerationState>;
	_runBlockGeneration(
		prompt: string,
		blockId: string,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState>;
	_runDocumentGeneration(
		prompt: string,
		preferredBlockId?: string | null,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState>;
	_runSelectionGeneration(
		prompt: string,
		selection: TextSelection,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState>;
	_setInlineSessionComposerOpen(
		sessionId: string,
		isOpen: boolean,
		options?: { openReason?: "user" | "history" },
	): void;
	_recordInlinePromptSubmissionCheckpoint(
		sessionId: string,
		prompt: string,
	): void;
	_applySuggestedAIOps(
		ops: readonly DocumentOp[],
		sessionId?: string,
		options?: {
			generationId?: string;
			origin?: OpOrigin;
			requestId?: string;
			suggestionIds?: readonly string[];
			turnId?: string;
			undoGroupId?: string;
		},
	): void;
	_createSelectionSignature(selection: SelectionState): string | null;
	_recordFastApplyDebug(
		overrides: Partial<
			NonNullable<NonNullable<GenerationState["debug"]>["fastApply"]>
		>,
	): void;
	_commitRequestedOperationResult(
		operation: AIRequestedOperation,
		text: string,
		sessionId: string | undefined,
		options: {
			contentFormat: AIContentFormat;
			applyStrategy?: AIApplyStrategy;
		},
	): AIMutationReceipt;
	_commitSelectionRewrite(
		selection: TextSelection,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId?: string,
	): AIMutationReceipt;
	_commitBufferedBlockGeneration(
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		contentFormat: AIContentFormat,
		sessionId?: string,
		options?: {
			applyStrategy?: AIApplyStrategy;
			insertionOffset?: number;
			workingSet?: AIWorkingSetEnvelope | null;
			replaceTargetBlock?: boolean;
			replaceBlockIds?: readonly string[];
		},
	): AIMutationReceipt;
	_commitBufferedMarkdownFastApply(
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		workingSet: AIWorkingSetEnvelope | null,
	): AIMutationReceipt | null;
	_resolveMarkdownFastApplyScope(
		blockId: string,
		workingSet: AIWorkingSetEnvelope | null,
	): { markdown: string; blockIds: string[] } | null;
	_buildPlanValidationContext(
		blockId: string,
		scopeBlockIds: readonly string[],
	): PlanValidationContext;
	_resolvePlanValidationTargetKind(blockId: string): AITargetKind;
	_verifyMarkdownFastApplyResult(
		blockIds: readonly string[],
		markdown: string,
	): { valid: boolean; reason?: string };
	_verifyFlowPatchPlanResult(
		plan: {
			edits: Array<{
				locator: { blockId?: string; blockIds?: string[] };
			}>;
		},
		ops: readonly DocumentOp[],
		scopeBlockIds: readonly string[],
	): {
		valid: boolean;
		reason?: string;
		untouchedBlockMutationCount: number;
	};
	_buildMarkdownScopedReplacementOps(
		blockIds: readonly string[],
		text: string,
	): DocumentOp[];
	_summarizeFastApplyFallbackOps(
		kind: "scoped-replacement" | "plain-markdown",
		ops: readonly DocumentOp[],
		targetBlockCount?: number,
	): {
		kind: "scoped-replacement" | "plain-markdown";
		opsCount: number;
		insertedBlockCount: number;
		deletedBlockCount: number;
		targetBlockCount?: number;
	};
	_readBlockIdsFromOp(op: DocumentOp): string[];
	_applySuggestedMarkdownPlaceholderReplacement(
		blockId: string,
		text: string,
		sessionId?: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[] | null;
	_refreshStreamingMarkdownBlockPreview(
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		baselineSuggestionIds: ReadonlySet<string>,
		previewSuggestionIds: readonly string[],
		previousNormalizedText: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): { suggestionIds: string[]; normalizedText: string };
	_commitStructuredPlan(
		ops: DocumentOp[],
		reviewSafe: boolean,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		adapterId: NonNullable<GenerationState["adapterId"]>,
		blockClass: NonNullable<GenerationState["blockClass"]>,
		transportKind: NonNullable<GenerationState["transportKind"]>,
	): AIMutationReceipt;
	_buildTextBlockGenerationOps(
		blockId: string,
		text: string,
		insertionOffset?: number,
	): DocumentOp[];
	_buildMarkdownBlockGenerationOps(
		blockId: string,
		text: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[];
	_buildFallbackMutationReceipt(input: {
		currentText: string;
		suggestionIds: readonly string[];
		reviewItems: readonly StructuralReviewItem[];
		planExecutionIssueCount: number;
		adapterId: NonNullable<GenerationState["adapterId"]>;
		blockClass: NonNullable<GenerationState["blockClass"]>;
		transportKind: NonNullable<GenerationState["transportKind"]>;
	}): AIMutationReceipt;
	_buildWorkingSet(
		toolRuntime: ToolRuntime,
		route: RequestRouterDecision,
		target: GenerationTarget,
		blockId: string,
		prompt: string,
	): Promise<AIWorkingSetEnvelope | null>;
	_refineRouteWithWorkingSet(
		route: RequestRouterDecision,
		workingSet: AIWorkingSetEnvelope | null,
	): RequestRouterDecision;
	_validateWorkingSet(
		route: RequestRouterDecision,
		target: GenerationTarget,
		workingSet: AIWorkingSetEnvelope | null,
	): { valid: boolean; canRefresh: boolean; reason?: string };
	_resolveMarkdownFastApplyWindow(
		route: RequestRouterDecision,
		blockId: string,
	): {
		range: { startBlockId: string; endBlockId: string };
		blockIds: string[];
	} | null;
	_resolveMarkdownFastApplyRetrievedSpan(
		toolRuntime: ToolRuntime,
		route: RequestRouterDecision,
		blockId: string,
		prompt: string,
	): Promise<AIWorkingSetRetrievedSpan | null>;
	_captureBlockRevisions(blockIds: readonly string[]): Record<string, number>;
	_resolveContentFormat(
		target: GenerationState["target"],
		surface?: AISurface,
	): AIContentFormat;
	_rejectPreviewSuggestions(suggestionIds: readonly string[]): void;
	getSuggestions(): readonly PersistentSuggestion[];
	getStreamEvents(): readonly AIStreamEvent[];
	_queuedInlineHistoryShortcutDirections: AIInlineHistoryDirection[];
	_queuedInlineHistoryShortcutFlushScheduled: boolean;
	_handledUndoHistoryRequestId: number | null;
	rejectActiveGeneration(): boolean;
	runSessionPrompt(
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState>;
	_findInlineHistorySnapshotForResolvedTurn(
		session: AISession,
		direction: AIInlineHistoryDirection,
	): AIInlineHistorySnapshot | null;
	_resolveInlineHistoryTraversalSnapshot(
		targetSnapshot: AIInlineHistorySnapshot,
	): AIInlineHistorySnapshot;
	_scheduleQueuedInlineHistoryShortcutFlush(): void;
	_resolvePendingInlineHistoryRestoreTargetIndex(
		request: AIInlineHistoryRestoreRequest,
	): number;
	_canHandleInlineHistoryShortcut(
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): boolean;
	_navigateInlineHistory(
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): boolean;
	_resolveInlineHistoryTargetIndex(
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): number;
	_resolveShortcutInlineHistorySessionId(
		currentSnapshot: AIInlineHistorySnapshot | null,
		direction: AIInlineHistoryDirection,
	): string | null;
	_buildInlineShortcutHistoryWaypoints(
		sessionId: string | null,
	): AIInlineShortcutHistoryWaypoint[];
	_resolveCurrentInlineShortcutWaypointIndex(
		waypoints: readonly AIInlineShortcutHistoryWaypoint[],
		sessionId: string | null,
	): number;
	_resolveExternalInlineTurnTransition(
		currentSnapshot: AIInlineHistorySnapshot | null,
		targetSnapshot: AIInlineHistorySnapshot,
		direction: AIInlineHistoryDirection,
	): AIExternalInlineTurnResult | null;
	_inlineHistorySnapshotHasTurn(
		snapshot: AIInlineHistorySnapshot,
		sessionId: string,
		turnId: string,
	): boolean;
	_applyExternalInlineTurnTransition(
		result: AIExternalInlineTurnResult,
		direction: AIInlineHistoryDirection,
		targetSnapshot: AIInlineHistorySnapshot,
		targetIndex: number,
		options?: { shortcutOnly?: boolean },
	): boolean;
	_applyInlineHistorySnapshot(
		snapshot: AIInlineHistorySnapshot,
		options?: { historyTraversal?: boolean },
	): void;
	_resolveShortcutInlineHistoryTraversalSnapshot(
		targetSnapshot: AIInlineHistorySnapshot,
		sessionId?: string | null,
	): AIInlineHistorySnapshot;
	_createExternalInlineTurnHistorySessions(
		sessionId: string,
		turnId: string,
		includeTurn: boolean,
	): readonly AISession[];
	_restoreInlineHistorySnapshotFromUndo(
		snapshot: AIInlineHistorySnapshot,
	): void;
	_handleHistoryApplied(event: HistoryAppliedEvent): void;
	_recordInlineHistorySnapshot(
		previousState: AIControllerState,
		nextState: AIControllerState,
	): void;
	_createInlineTurnUndoBeforeSnapshot(
		sessionId: string,
		turnId: string,
	): AIInlineHistorySnapshot;
	_recordSessionFastApplyMetrics(
		sessionId: string,
		fastApply: FastApplyDebugState | undefined,
	): void;
	_resolveActiveGeneration(overrides: Partial<GenerationState>): void;
	_applyReviewItems(
		ids: readonly string[],
		action: "accept" | "reject",
	): boolean;
	acceptActiveGeneration(): boolean;
	acceptReviewItem(id: string): boolean;
	rejectReviewItem(id: string): boolean;
	acceptReviewItems(ids: readonly string[]): boolean;
	rejectReviewItems(ids: readonly string[]): boolean;
}
