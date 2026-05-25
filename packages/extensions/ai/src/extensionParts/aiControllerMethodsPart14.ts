// @ts-nocheck
import {
	createDecorationSet,
	ensureInlineCompletionController,
	getInlineCompletionController as getInlineCompletionControllerFromCore,
} from "@pen/core";
import {
	buildDocumentWriteOps,
	getDocumentToolRuntime,
} from "@pen/document-ops";
import type {
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
import {
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
import { runAgenticLoop } from "../agentic/loop";
import { defaultAICommands } from "../commands/defaultCommands";
import { AICommandRegistry } from "../commands/registry";
import { AIInlineHistoryService, AIReviewService } from "../controllers";
import { buildAffectedRangeDecorations } from "../decorations/affectedRange";
import { buildGenerationZoneDecorations } from "../decorations/generationZone";
import { buildTrackChangesDecorations } from "../decorations/trackChanges";
import { getBlockAdapter } from "../runtime/blockAdapters";
import type {
	AIApplyStrategy,
	AIContentFormat,
	AITargetKind,
} from "../runtime/contracts";
import { resolveDocumentInsertionAnchor } from "../runtime/documentInsertionAnchor";
import {
	MARKDOWN_FAST_APPLY_ROOT_TAG,
	normalizeFlowMarkdownOutput,
} from "../runtime/flowMarkdown";
import {
	applyMarkdownFastApply,
	parseMarkdownFastApplyContract,
} from "../runtime/markdownFastApply";
import { parseMarkdownPatchPlanContract } from "../runtime/markdownPatchPlan";
import { buildMutationReceipt } from "../runtime/mutationReceipt";
import { buildDocumentMutationPlanExecution } from "../runtime/planExecutor";
import { validateDocumentMutationPlanShape } from "../runtime/planValidation";
import type { StructuralReviewItem } from "../runtime/reviewArtifacts";
import {
	buildStructuralReviewItems,
	removeStructuralReviewItemPlan,
	selectStructuralReviewItemPlan,
} from "../runtime/reviewArtifacts";
import {
	classifyPromptIntent,
	refineRouteWithNavigator,
	routeAIRequest,
} from "../runtime/router";
import {
	isClearDocumentPrompt,
	isDocumentFollowUpEditPrompt,
	isDocumentResetPrompt,
	isWholeDocumentRewritePrompt,
} from "../runtime/promptTargeting";
import { SuggestedAIOperationRunner } from "../runtime/suggestedOperationRunner";
import { compileStructuredIntentToPlan } from "../runtime/structuredIntentCompiler";
import {
	buildPlannerPrompt,
	parseStructuredPlanPreview,
	parseStructuredPlanResult,
	resolveExecutionMode,
} from "../runtime/structuredPlanner";
import {
	buildGenerationStructuredPreviewState,
	buildStructuredPreviewPatchOperations,
} from "../runtime/structuredPreview";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	acceptSuggestions,
	rejectAllSuggestions,
	rejectSuggestion,
	rejectSuggestions,
} from "../suggestions/acceptReject";
import { readAllSuggestions } from "../suggestions/persistent";
import {
	AI_SESSION_SUGGESTION_ORIGIN,
	interceptApplyForSuggestMode,
	shouldBypassSuggestMode,
	SUGGESTION_RESOLUTION_ORIGIN,
} from "../suggestions/suggestMode";
import type {
	AICommandBinding,
	AICommandContext,
	AICommandExecutionOptions,
	AIContextualPromptRect,
	AIController,
	AIControllerState,
	AIExtensionConfig,
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
} from "../types";
import { resolveGenerationRequestMode, isLocalRequestedOperation, EMPTY_TOOL_RUNTIME, MAX_STREAM_EVENTS, AI_UNDO_HISTORY_METADATA_KEY, resolveOrderedReviewItems, sortReviewItemsForRemoval, compareReviewItemRemovalOrder, resolveActiveBlockId, readModelId, supportsStructuredIntent, createAIStreamEvent, resolvePromptTarget, resolveSessionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot, resolveContextualPromptAnchor, resolveContextualPromptState, createInlineHistorySnapshot, cloneSessionTarget, cloneInlineHistorySessions, recreateTextSelection, resolveSelectionSnapshotBlockRange, resolveSelectionSnapshotRangeStart, resolveSelectionSnapshotRangeEnd, resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt, createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal, resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation, resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot, resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange, buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual, buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpers";
import type { GenerationTarget, GenerationExecutionContext, AIInlineHistoryRestoreRequest, AIInlineShortcutHistoryPhase, AIInlineShortcutHistoryState, AIInlineShortcutHistoryWaypoint, AIStreamEventInput } from "./extensionHelpers";

export const aiControllerMethodsPart14 = {
_updateSessionTurn(this: any, 
		sessionId: string,
		turnId: string,
		overrides: Partial<AISession["turns"][number]>,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return;
		}
		const nextTurns = session.turns.map((turn) =>
			turn.id !== turnId
				? turn
				: {
						...turn,
						...overrides,
					},
		);
		if (areStructuredValuesEqual(session.turns, nextTurns)) {
			return;
		}
		const pendingSuggestionIds = [
			...new Set(nextTurns.flatMap((turn) => turn.suggestionIds)),
		];
		const pendingReviewItemIds = [
			...new Set(nextTurns.flatMap((turn) => turn.reviewItemIds)),
		];
		this._updateSession(sessionId, {
			turns: nextTurns,
			pendingSuggestionIds,
			pendingReviewItemIds,
		});
	},

_syncSessionsFromDocument(this: any): boolean {
		if (this._state.sessions.length === 0) {
			return false;
		}
		const nextSessions = this._state.sessions.map((session) => {
			const nextTurns = session.turns.map((turn) => {
				const suggestionIds = turn.suggestionIds.filter(
					(sessionSuggestionId) =>
						this._suggestions.some(
							(suggestion) =>
								suggestion.id === sessionSuggestionId,
						),
				);
				const activeGenerationMatchesTurn =
					this._state.activeGeneration?.sessionId === session.id &&
					this._state.activeGeneration.turnId === turn.id;
				const activeGenerationForTurn = activeGenerationMatchesTurn
					? this._state.activeGeneration
					: null;
				const reviewItemIds = activeGenerationForTurn
					? (activeGenerationForTurn.reviewItems ?? [])
							.map((item) => item.id)
							.filter((id) => turn.reviewItemIds.includes(id))
					: [];
				const structuredPreview = activeGenerationForTurn
					? (activeGenerationForTurn.structuredPreview ??
						turn.structuredPreview ??
						null)
					: turn.reviewItemIds.length > 0
						? (turn.structuredPreview ?? null)
						: null;
				return {
					...turn,
					suggestionIds,
					reviewItemIds,
					structuredPreview,
				};
			});
			const pendingSuggestionIds = [
				...new Set(nextTurns.flatMap((turn) => turn.suggestionIds)),
			];
			const pendingReviewItemIds = [
				...new Set(nextTurns.flatMap((turn) => turn.reviewItemIds)),
			];
			const nextStatus =
				pendingSuggestionIds.length === 0 &&
				pendingReviewItemIds.length === 0 &&
				session.status === "streaming"
					? "complete"
					: session.status;
			return {
				...session,
				status: nextStatus,
				turns: nextTurns,
				pendingSuggestionIds,
				pendingReviewItemIds,
			};
		});
		if (areSessionsEqual(this._state.sessions, nextSessions)) {
			return false;
		}
		this._setState({
			sessions: nextSessions,
		});
		return true;
	},

_setStreamEvents(this: any, nextEvents: readonly AIStreamEvent[]): void {
		this._streamEvents = nextEvents;
		this._emitStreamEvents();
	},

_appendStreamEvent(this: any, event: AIStreamEvent): void {
		const lastEvent = this._streamEvents[this._streamEvents.length - 1];
		if (
			lastEvent?.type === "status" &&
			event.type === "status" &&
			lastEvent.generationId === event.generationId &&
			lastEvent.status === event.status
		) {
			return;
		}
		const nextEvents =
			this._streamEvents.length >= MAX_STREAM_EVENTS
				? [...this._streamEvents.slice(-(MAX_STREAM_EVENTS - 1)), event]
				: [...this._streamEvents, event];
		this._setStreamEvents(nextEvents);
	},

_emit(this: any): void {
		for (const listener of this._listeners) {
			listener();
		}
		for (const listener of this._sessionListeners) {
			listener();
		}
	},

_emitStreamEvents(this: any): void {
		for (const listener of this._streamEventListeners) {
			listener();
		}
	},

_syncSuggestionsFromDocument(this: any): boolean {
		const nextSuggestions = readAllSuggestions(this._editor);
		if (areSuggestionsEqual(this._suggestions, nextSuggestions)) {
			return false;
		}
		this._suggestions = nextSuggestions;
		return true;
	},

_recordInlineHistorySnapshot(this: any, 
		previousState: AIControllerState,
		nextState: AIControllerState,
	): void {
		if (!didInlineHistoryCheckpointChange(previousState, nextState)) {
			return;
		}
		if (
			previousState.sessions === nextState.sessions &&
			previousState.activeSessionId === nextState.activeSessionId
		) {
			return;
		}
		const currentSnapshot = this._inlineHistory[this._inlineHistoryIndex];
		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		if (nextHistory.length === 0) {
			const baselineSnapshot = createInlineHistorySnapshot(
				this._editor,
				previousState.sessions,
				previousState.activeSessionId ?? null,
				this._documentVersion,
			);
			nextHistory.push(baselineSnapshot);
		}
		const previousSnapshot =
			nextHistory[nextHistory.length - 1] ?? currentSnapshot ?? null;
		const snapshot = createInlineHistorySnapshot(
			this._editor,
			nextState.sessions,
			nextState.activeSessionId ?? null,
			this._documentVersion,
			{
				kind:
					previousSnapshot?.documentVersion === this._documentVersion
						? "ui-local"
						: "document-coupled",
			},
		);
		if (
			currentSnapshot &&
			areInlineHistorySnapshotsEqual(currentSnapshot, snapshot)
		) {
			return;
		}
		const currentUndoMetadata =
			this._undoHistoryMetadata?.getCurrentEntryMetadata<AIInlineHistorySnapshot>(
				AI_UNDO_HISTORY_METADATA_KEY,
			) ?? null;
		const shouldPersistUndoSnapshot =
			previousSnapshot != null &&
			(snapshot.kind === "document-coupled" ||
				currentUndoMetadata?.after?.documentVersion ===
					this._documentVersion);
		if (shouldPersistUndoSnapshot && previousSnapshot) {
			this._undoHistoryMetadata?.setCurrentEntryMetadata(
				AI_UNDO_HISTORY_METADATA_KEY,
				{
					before: currentUndoMetadata?.before ?? previousSnapshot,
					after: snapshot,
				},
			);
		}
		nextHistory.push(snapshot);
		this._inlineHistory = nextHistory;
		this._inlineHistoryIndex = nextHistory.length - 1;
	},

_recordInlinePromptSubmissionCheckpoint(this: any, 
		sessionId: string,
		prompt: string,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (
			!session ||
			session.surface !== "inline-edit" ||
			!session.contextualPrompt
		) {
			return;
		}
		const checkpointState: AIControllerState = {
			...this._state,
			activeSessionId: sessionId,
			sessions: this._state.sessions.map((item) =>
				item.id !== sessionId
					? item
					: {
							...item,
							contextualPrompt: {
								...item.contextualPrompt!,
								composer: {
									...item.contextualPrompt!.composer,
									draftPrompt: prompt,
									isOpen: true,
									isSubmitting: false,
								},
							},
						},
			),
		};
		const snapshot = createInlineHistorySnapshot(
			this._editor,
			checkpointState.sessions,
			checkpointState.activeSessionId ?? null,
			this._documentVersion,
			{ kind: "ui-local" },
		);
		const currentSnapshot = this._inlineHistory[this._inlineHistoryIndex];
		if (
			currentSnapshot &&
			areInlineHistorySnapshotsEqual(currentSnapshot, snapshot)
		) {
			return;
		}
		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		nextHistory.push(snapshot);
		this._inlineHistory = nextHistory;
		this._inlineHistoryIndex = nextHistory.length - 1;
	},

_resolveInlineHistoryTargetIndex(this: any, 
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): number {
		const step = direction === "undo" ? -1 : 1;
		if (!options?.shortcutOnly) {
			return this._inlineHistoryIndex + step;
		}
		const currentSnapshot =
			this._inlineHistory[this._inlineHistoryIndex] ?? null;
		const scopedSessionId = this._resolveShortcutInlineHistorySessionId(
			currentSnapshot,
			direction,
		);
		const waypoints =
			this._buildInlineShortcutHistoryWaypoints(scopedSessionId);
		if (waypoints.length === 0) {
			return -1;
		}
		const currentWaypointIndex =
			this._resolveCurrentInlineShortcutWaypointIndex(
				waypoints,
				scopedSessionId,
			);
		if (currentWaypointIndex < 0) {
			return -1;
		}
		const targetWaypoint = waypoints[currentWaypointIndex + step];
		return targetWaypoint?.representativeIndex ?? -1;
	}
};
