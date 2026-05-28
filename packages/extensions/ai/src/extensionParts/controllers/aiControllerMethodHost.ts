import type { DocumentOp, Editor, OpOrigin, TextSelection, UndoHistoryMetadataController } from "@pen/types";
import type { SuggestedAIOperationRunner } from "../../runtime/suggestedOperationRunner";
import type { ExternalInlineTurnRegistry } from "../../runtime/externalInlineTurnRegistry";
import type {
	AICommandExecutionOptions,
	AIControllerState,
	AIExtensionConfig,
	AIExternalInlineTurnResult,
	AIInlineCompletionController,
	AIInlineHistoryDirection,
	AIInlineHistorySnapshot,
	AISession,
	AISessionResolution,
	GenerationState,
	PersistentSuggestion,
} from "../../types";
import type {
	AIInlineHistoryRestoreRequest,
	AIInlineShortcutHistoryState,
	AIInlineShortcutHistoryWaypoint,
	GenerationExecutionContext,
	GenerationTarget,
} from "../extensionHelpers";

export interface AIControllerMethodHost {
	_editor: Editor;
	_inlineCompletion: AIInlineCompletionController;
	_suggestedOperationRunner: SuggestedAIOperationRunner;
	_suggestionPresentation: NonNullable<
		AIExtensionConfig["suggestionPresentation"]
	>;
	_state: AIControllerState;
	_suggestions: PersistentSuggestion[];
	_undoHistoryMetadata: UndoHistoryMetadataController | null;
	_externalInlineTurnRegistry: ExternalInlineTurnRegistry;
	_sessionListeners: Set<() => void>;
	_abortController: AbortController | null;
	_inlineHistory: AIInlineHistorySnapshot[];
	_inlineHistoryIndex: number;
	_documentVersion: number;
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
	handleExternalCommit(
		events: readonly {
			origin: OpOrigin;
			affectedBlocks: readonly string[];
		}[],
	): void;
	_executeGeneration(
		prompt: string,
		target: GenerationTarget,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState>;
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
			suggestionIds?: readonly string[];
			turnId?: string;
		},
	): void;
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
		sessionId: string | null,
	): AIInlineHistorySnapshot;
	_createExternalInlineTurnHistorySessions(
		sessionId: string,
		turnId: string,
		includeTurn: boolean,
	): readonly AISession[];
}
