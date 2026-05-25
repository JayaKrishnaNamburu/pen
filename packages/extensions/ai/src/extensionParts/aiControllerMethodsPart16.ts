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

export const aiControllerMethodsPart16 = {
_findInlineHistorySnapshotForResolvedTurn(this: any, 
		session: AISession,
		direction: AIInlineHistoryDirection,
	): AIInlineHistorySnapshot | null {
		const latestTurnId =
			session.turns[session.turns.length - 1]?.id ?? null;
		if (!latestTurnId) {
			return null;
		}
		for (
			let index = this._inlineHistory.length - 1;
			index >= 0;
			index -= 1
		) {
			const snapshot = this._inlineHistory[index];
			const snapshotSession =
				snapshot?.sessions.find(
					(item) =>
						item.id === session.id &&
						item.surface === "inline-edit",
				) ?? null;
			if (!snapshotSession) {
				continue;
			}
			const snapshotTurn =
				snapshotSession.turns.find(
					(turn) => turn.id === latestTurnId,
				) ?? null;
			if (!snapshotTurn) {
				continue;
			}
			if (
				direction === "undo" &&
				snapshotSession.contextualPrompt?.composer.isOpen &&
				snapshotTurn.status === "review"
			) {
				return snapshot;
			}
			if (
				direction === "redo" &&
				!snapshotSession.contextualPrompt?.composer.isOpen &&
				(snapshotTurn.status === "accepted" ||
					snapshotTurn.status === "rejected")
			) {
				return snapshot;
			}
		}
		return null;
	},

_resolveInlineHistoryTraversalSnapshot(this: any, 
		targetSnapshot: AIInlineHistorySnapshot,
	): AIInlineHistorySnapshot {
		if (targetSnapshot.kind === "ui-local") {
			return targetSnapshot;
		}
		const scopedSessionId =
			targetSnapshot.sessionId ?? targetSnapshot.activeSessionId;
		const targetState = resolveInlineShortcutHistoryState(
			targetSnapshot,
			scopedSessionId,
		);
		if (!targetState) {
			return targetSnapshot;
		}
		let resolvedSnapshot = targetSnapshot;
		for (const snapshot of this._inlineHistory) {
			if (snapshot.documentVersion !== targetSnapshot.documentVersion) {
				continue;
			}
			const snapshotState = resolveInlineShortcutHistoryState(
				snapshot,
				scopedSessionId,
			);
			if (
				!snapshotState ||
				!areInlineShortcutHistoryStatesEqual(snapshotState, targetState)
			) {
				continue;
			}
			if (
				shouldReplaceInlineShortcutWaypointRepresentative(
					targetState,
					resolvedSnapshot,
					snapshot,
				)
			) {
				resolvedSnapshot = snapshot;
			}
		}
		return resolvedSnapshot;
	},

_resolveShortcutInlineHistoryTraversalSnapshot(this: any, 
		targetSnapshot: AIInlineHistorySnapshot,
		fallbackSessionId?: string | null,
	): AIInlineHistorySnapshot {
		const scopedSessionId =
			targetSnapshot.sessionId ??
			targetSnapshot.activeSessionId ??
			fallbackSessionId ??
			null;
		const targetState = resolveInlineShortcutHistoryState(
			targetSnapshot,
			scopedSessionId,
		);
		if (targetState?.phase !== "none" || !scopedSessionId) {
			return this._resolveInlineHistoryTraversalSnapshot(targetSnapshot);
		}
		return createInlineHistorySnapshot(
			this._editor,
			targetSnapshot.sessions.filter(
				(session) => session.id !== scopedSessionId,
			),
			targetSnapshot.activeSessionId === scopedSessionId
				? null
				: targetSnapshot.activeSessionId,
			targetSnapshot.documentVersion,
			{ kind: targetSnapshot.kind },
		);
	},

_scheduleQueuedInlineHistoryShortcutFlush(this: any): void {
		if (
			this._queuedInlineHistoryShortcutFlushScheduled ||
			this._queuedInlineHistoryShortcutDirections.length === 0
		) {
			return;
		}
		this._queuedInlineHistoryShortcutFlushScheduled = true;
		queueMicrotask(() => {
			this._queuedInlineHistoryShortcutFlushScheduled = false;
			if (this._pendingInlineHistoryRestore) {
				this._scheduleQueuedInlineHistoryShortcutFlush();
				return;
			}
			const nextDirection =
				this._queuedInlineHistoryShortcutDirections.shift() ?? null;
			if (!nextDirection) {
				return;
			}
			this._navigateInlineHistory(nextDirection, { shortcutOnly: true });
			if (this._queuedInlineHistoryShortcutDirections.length > 0) {
				this._scheduleQueuedInlineHistoryShortcutFlush();
			}
		});
	},

_resolvePendingInlineHistoryRestoreTargetIndex(this: any, 
		request: AIInlineHistoryRestoreRequest,
	): number {
		const exactTargetIndex = this._inlineHistory.findIndex(
			(snapshot) => snapshot.id === request.targetSnapshotId,
		);
		if (exactTargetIndex >= 0) {
			return exactTargetIndex;
		}
		if (!request.targetState) {
			return -1;
		}
		let resolvedTargetIndex = -1;
		const scopedSessionId =
			request.sessionId ?? request.targetState.sessionId;
		for (let index = 0; index < this._inlineHistory.length; index += 1) {
			const snapshot = this._inlineHistory[index];
			if (!snapshot || snapshot.kind === "ui-local") {
				continue;
			}
			if (snapshot.documentVersion !== request.targetDocumentVersion) {
				continue;
			}
			const snapshotState = resolveInlineShortcutHistoryState(
				snapshot,
				scopedSessionId ?? null,
			);
			if (
				!snapshotState ||
				!areInlineShortcutHistoryStatesEqual(
					snapshotState,
					request.targetState,
				)
			) {
				continue;
			}
			if (
				resolvedTargetIndex < 0 ||
				shouldReplaceInlineShortcutWaypointRepresentative(
					request.targetState,
					this._inlineHistory[resolvedTargetIndex] ?? null,
					snapshot,
				)
			) {
				resolvedTargetIndex = index;
			}
		}
		return resolvedTargetIndex;
	},

_handleHistoryApplied(this: any, event: HistoryAppliedEvent): void {
		if (
			this._pendingInlineHistoryRestore &&
			this._pendingInlineHistoryRestore.direction === event.kind
		) {
			const targetIndex =
				this._resolvePendingInlineHistoryRestoreTargetIndex(
					this._pendingInlineHistoryRestore,
				);
			if (targetIndex >= 0) {
				this._inlineHistoryIndex = targetIndex;
				const targetSnapshot = this._inlineHistory[targetIndex]!;
				const resolvedTargetSnapshot = this._pendingInlineHistoryRestore
					.shortcutOnly
					? this._resolveShortcutInlineHistoryTraversalSnapshot(
							targetSnapshot,
							this._pendingInlineHistoryRestore.sessionId ?? null,
						)
					: this._resolveInlineHistoryTraversalSnapshot(
							targetSnapshot,
						);
				this._applyInlineHistorySnapshot(resolvedTargetSnapshot, {
					historyTraversal: true,
				});
			}
			this._pendingInlineHistoryRestore = null;
			this._scheduleQueuedInlineHistoryShortcutFlush();
			return;
		}
		if (this._handledUndoHistoryRequestId === event.requestId) {
			this._handledUndoHistoryRequestId = null;
			return;
		}
		const selection = event.selection;
		if (selection?.type !== "text" || selection.isCollapsed) {
			return;
		}
		const matchingSession = [...this._state.sessions]
			.reverse()
			.find(
				(session) =>
					session.surface === "inline-edit" &&
					session.status !== "cancelled" &&
					sessionSelectionMatches(session, selection),
			);
		if (!matchingSession) {
			return;
		}
		this._setInlineSessionComposerOpen(matchingSession.id, true, {
			openReason: "history",
		});
	},

_setInlineSessionComposerOpen(this: any, 
		sessionId: string,
		isOpen: boolean,
		options?: { openReason?: "user" | "history" },
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
		const nextActiveSessionId = isOpen
			? sessionId
			: this._state.activeSessionId === sessionId
				? null
				: this._state.activeSessionId;
		if (
			session.contextualPrompt.composer.isOpen === isOpen &&
			nextActiveSessionId === this._state.activeSessionId
		) {
			return;
		}
		const nextSessions = this._state.sessions.map((item) =>
			item.id !== sessionId
				? item
				: {
						...item,
						contextualPrompt: {
							...item.contextualPrompt!,
							composer: {
								...item.contextualPrompt!.composer,
								isOpen,
								openReason: isOpen
									? (options?.openReason ?? "user")
									: item.contextualPrompt!.composer
											.openReason,
							},
						},
						updatedAt: Date.now(),
					},
		);
		this._setState({
			sessions: nextSessions,
			activeSessionId: nextActiveSessionId,
		});
	}
};
