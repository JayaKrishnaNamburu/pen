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

export const aiControllerMethodsPart15 = {
_resolveShortcutInlineHistorySessionId(this: any, 
		currentSnapshot: AIInlineHistorySnapshot | null,
		direction: AIInlineHistoryDirection,
	): string | null {
		const activeSession = this.getActiveSession();
		if (activeSession?.surface === "inline-edit") {
			return activeSession.id;
		}
		const selection = this._editor.selection;
		if (
			currentSnapshot &&
			selection?.type === "text" &&
			!selection.isCollapsed
		) {
			const matchingSession = [...currentSnapshot.sessions]
				.reverse()
				.find(
					(session) =>
						session.surface === "inline-edit" &&
						sessionSelectionMatches(session, selection),
				);
			if (matchingSession) {
				return matchingSession.id;
			}
		}
		if (
			currentSnapshot?.activeSessionId &&
			currentSnapshot.sessions.some(
				(session) =>
					session.id === currentSnapshot.activeSessionId &&
					session.surface === "inline-edit",
			)
		) {
			return currentSnapshot.activeSessionId;
		}
		const currentInlineSession =
			[...(currentSnapshot?.sessions ?? [])]
				.reverse()
				.find((session) => session.surface === "inline-edit") ?? null;
		if (currentInlineSession) {
			return currentInlineSession.id;
		}
		const step = direction === "undo" ? -1 : 1;
		let searchIndex = this._inlineHistoryIndex + step;
		while (searchIndex >= 0 && searchIndex < this._inlineHistory.length) {
			const searchSnapshot = this._inlineHistory[searchIndex];
			const matchingSelectionSession =
				selection?.type === "text" && !selection.isCollapsed
					? ([...(searchSnapshot?.sessions ?? [])]
							.reverse()
							.find(
								(session) =>
									session.surface === "inline-edit" &&
									sessionSelectionMatches(session, selection),
							) ?? null)
					: null;
			if (matchingSelectionSession) {
				return matchingSelectionSession.id;
			}
			const searchInlineSession =
				[...(searchSnapshot?.sessions ?? [])]
					.reverse()
					.find((session) => session.surface === "inline-edit") ??
				null;
			if (searchInlineSession) {
				return searchInlineSession.id;
			}
			searchIndex += step;
		}
		return null;
	},

_buildInlineShortcutHistoryWaypoints(this: any, 
		sessionId: string | null,
	): AIInlineShortcutHistoryWaypoint[] {
		const waypoints: AIInlineShortcutHistoryWaypoint[] = [];
		for (let index = 0; index < this._inlineHistory.length; index += 1) {
			const snapshot = this._inlineHistory[index];
			if (!snapshot || snapshot.kind === "ui-local") {
				continue;
			}
			const state = resolveInlineShortcutHistoryState(
				snapshot,
				sessionId,
			);
			if (!state) {
				continue;
			}
			const previousWaypoint = waypoints[waypoints.length - 1] ?? null;
			if (
				previousWaypoint &&
				areInlineShortcutHistoryStatesEqual(
					previousWaypoint.state,
					state,
				)
			) {
				previousWaypoint.endIndex = index;
				if (
					shouldReplaceInlineShortcutWaypointRepresentative(
						previousWaypoint.state,
						this._inlineHistory[
							previousWaypoint.representativeIndex
						] ?? null,
						snapshot,
					)
				) {
					previousWaypoint.representativeIndex = index;
				}
				continue;
			}
			waypoints.push({
				startIndex: index,
				endIndex: index,
				representativeIndex: index,
				state,
			});
		}
		return waypoints;
	},

_resolveCurrentInlineShortcutWaypointIndex(this: any, 
		waypoints: readonly AIInlineShortcutHistoryWaypoint[],
		sessionId: string | null,
	): number {
		const currentSnapshot =
			this._inlineHistory[this._inlineHistoryIndex] ?? null;
		const currentState = currentSnapshot
			? resolveInlineShortcutHistoryState(currentSnapshot, sessionId)
			: null;
		if (currentState) {
			const currentIndex = waypoints.findIndex(
				(waypoint) =>
					this._inlineHistoryIndex >= waypoint.startIndex &&
					this._inlineHistoryIndex <= waypoint.endIndex &&
					areInlineShortcutHistoryStatesEqual(
						waypoint.state,
						currentState,
					),
			);
			if (currentIndex >= 0) {
				return currentIndex;
			}
			const matchingIndex = waypoints.findIndex((waypoint) =>
				areInlineShortcutHistoryStatesEqual(
					waypoint.state,
					currentState,
				),
			);
			if (matchingIndex >= 0) {
				return matchingIndex;
			}
		}
		for (let index = waypoints.length - 1; index >= 0; index -= 1) {
			if (
				waypoints[index]!.representativeIndex <=
				this._inlineHistoryIndex
			) {
				return index;
			}
		}
		return waypoints.length > 0 ? 0 : -1;
	},

_canHandleInlineHistoryShortcut(this: any, 
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): boolean {
		const targetIndex = this._resolveInlineHistoryTargetIndex(
			direction,
			options,
		);
		const targetSnapshot = this._inlineHistory[targetIndex];
		if (!targetSnapshot) {
			return false;
		}
		if (targetSnapshot.kind !== "ui-local") {
			return true;
		}
		return direction === "undo"
			? !this._editor.undoManager.canUndo()
			: !this._editor.undoManager.canRedo();
	},

_navigateInlineHistory(this: any, 
		direction: AIInlineHistoryDirection,
		options?: { shortcutOnly?: boolean },
	): boolean {
		const targetIndex = this._resolveInlineHistoryTargetIndex(
			direction,
			options,
		);
		const targetSnapshot = this._inlineHistory[targetIndex];
		if (!targetSnapshot) {
			return false;
		}
		const currentSnapshot =
			this._inlineHistory[this._inlineHistoryIndex] ?? null;
		const shortcutSessionId = options?.shortcutOnly
			? this._resolveShortcutInlineHistorySessionId(
					currentSnapshot,
					direction,
				)
			: null;
		if (targetSnapshot.kind === "ui-local") {
			this._applyInlineHistorySnapshot(targetSnapshot, {
				historyTraversal: true,
			});
			this._inlineHistoryIndex = targetIndex;
			return true;
		}
		if (
			currentSnapshot &&
			currentSnapshot.documentVersion !== targetSnapshot.documentVersion
		) {
			const targetState = resolveInlineShortcutHistoryState(
				targetSnapshot,
				shortcutSessionId ??
					targetSnapshot.sessionId ??
					targetSnapshot.activeSessionId ??
					null,
			);
			this._pendingInlineHistoryRestore = {
				direction,
				targetSnapshotId: targetSnapshot.id,
				targetDocumentVersion: targetSnapshot.documentVersion,
				shortcutOnly: options?.shortcutOnly === true,
				sessionId: shortcutSessionId,
				targetState,
			};
			const restored =
				direction === "undo"
					? this._editor.undoManager.undo()
					: this._editor.undoManager.redo();
			if (!restored) {
				this._pendingInlineHistoryRestore = null;
			}
			return restored;
		}
		const resolvedTargetSnapshot = options?.shortcutOnly
			? this._resolveShortcutInlineHistoryTraversalSnapshot(
					targetSnapshot,
					shortcutSessionId,
				)
			: targetSnapshot;
		this._applyInlineHistorySnapshot(resolvedTargetSnapshot, {
			historyTraversal: true,
		});
		this._inlineHistoryIndex = targetIndex;
		return true;
	},

_applyInlineHistorySnapshot(this: any, 
		snapshot: AIInlineHistorySnapshot,
		options?: { historyTraversal?: boolean },
	): void {
		this._isRestoringInlineHistory = true;
		try {
			const restoredSessions = cloneInlineHistorySessions(
				this._editor,
				snapshot.sessions,
			).map((session) => {
				if (
					!options?.historyTraversal ||
					!session.contextualPrompt?.composer.isOpen
				) {
					return session;
				}
				return {
					...session,
					contextualPrompt: {
						...session.contextualPrompt,
						composer: {
							...session.contextualPrompt.composer,
							openReason: "history" as const,
						},
					},
				};
			});
			this._setState({
				status: "idle",
				activeGeneration: null,
				sessions: restoredSessions,
				activeSessionId: snapshot.activeSessionId,
			});
		} finally {
			this._isRestoringInlineHistory = false;
		}
	},

_restoreInlineHistorySnapshotFromUndo(this: any, 
		snapshot: AIInlineHistorySnapshot,
	): void {
		const targetIndex = this._inlineHistory.findIndex(
			(item) => item.id === snapshot.id,
		);
		if (targetIndex >= 0) {
			this._inlineHistoryIndex = targetIndex;
			this._applyInlineHistorySnapshot(
				this._inlineHistory[targetIndex]!,
				{
					historyTraversal: true,
				},
			);
			return;
		}
		this._applyInlineHistorySnapshot(snapshot, { historyTraversal: true });
		const nextHistory = this._inlineHistory.slice(
			0,
			this._inlineHistoryIndex + 1,
		);
		nextHistory.push(snapshot);
		this._inlineHistory = nextHistory;
		this._inlineHistoryIndex = nextHistory.length - 1;
	}
};
