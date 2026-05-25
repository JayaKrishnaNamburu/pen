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

export const aiControllerMethodsPart13 = {
_resolveSessionTurn(this: any, 
		sessionId: string,
		turnId: string,
		resolution: AISessionResolution,
		options?: { finalizeSession?: boolean },
	): boolean {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		const turn = session?.turns.find((item) => item.id === turnId);
		if (!session || !turn) {
			return false;
		}
		const isBottomChatDocumentTurn =
			session.surface === "bottom-chat" &&
			(turn.target === "document" ||
				turn.operation?.kind === "document-transform" ||
				(turn.operation?.kind === "rewrite-selection" &&
					turn.operation.target.kind === "scoped-range" &&
					(turn.operation.target.scope === "document" ||
						turn.operation.target.contentFormat === "markdown")));
		const turnUndoGroupId = isBottomChatDocumentTurn
			? turn.undoGroupId
			: undefined;
		const turnSuggestionResolutionOrigin =
			turnUndoGroupId != null ? AI_SESSION_SUGGESTION_ORIGIN : undefined;
		const undoHistoryBeforeSnapshot = this._undoHistoryMetadata
			? this._createInlineTurnUndoBeforeSnapshot(sessionId, turnId)
			: null;
		const refreshedInlineSelectionTarget =
			session.surface === "inline-edit" && resolution === "accept"
				? (resolveAcceptedInlineSelectionTarget(
						this._editor,
						turn.operation,
						turn.suggestionIds,
					) ?? resolveLiveInlineSelectionTarget(this._editor))
				: null;
		const resolveSuggestionsForTurn =
			resolution === "accept"
				? (suggestionIds: readonly string[]) =>
						acceptSuggestions(this._editor, suggestionIds, {
							origin: turnSuggestionResolutionOrigin,
							undoGroupId: turnUndoGroupId,
						})
				: (suggestionIds: readonly string[]) =>
						rejectSuggestions(this._editor, suggestionIds, {
							origin: turnSuggestionResolutionOrigin,
							undoGroupId: turnUndoGroupId,
						});
		const resolveReviewItems =
			resolution === "accept"
				? (reviewItemIds: readonly string[]) =>
						this.acceptReviewItems(reviewItemIds)
				: (reviewItemIds: readonly string[]) =>
						this.rejectReviewItems(reviewItemIds);
		let resolved = false;
		resolved = resolveSuggestionsForTurn(turn.suggestionIds) || resolved;
		if (
			this._state.activeGeneration?.sessionId === sessionId &&
			this._state.activeGeneration.turnId === turnId &&
			this._state.activeGeneration.planState === "validated" &&
			turn.reviewItemIds.length > 0
		) {
			resolved = resolveReviewItems(turn.reviewItemIds) || resolved;
		}
		if (!resolved) {
			return false;
		}
		this._updateSessionTurn(sessionId, turnId, {
			status: resolution === "accept" ? "accepted" : "rejected",
			suggestionIds: [],
			reviewItemIds: [],
			structuredPreview: null,
			anchor: refreshedInlineSelectionTarget
				? resolveSessionAnchor(refreshedInlineSelectionTarget.selection)
				: undefined,
			selection: refreshedInlineSelectionTarget
				? resolveSessionSelectionSnapshot(
						refreshedInlineSelectionTarget.selection,
					)
				: undefined,
		});
		if (refreshedInlineSelectionTarget) {
			this._updateSession(sessionId, {
				target: refreshedInlineSelectionTarget,
				anchor: resolveSessionAnchor(
					refreshedInlineSelectionTarget.selection,
				),
				contextualPrompt: session.contextualPrompt
					? {
							...session.contextualPrompt,
							anchor: resolveContextualPromptAnchor(
								refreshedInlineSelectionTarget,
							),
						}
					: undefined,
			});
		}
		if (options?.finalizeSession === false) {
			if (undoHistoryBeforeSnapshot) {
				this._undoHistoryMetadata?.setCurrentEntryMetadata(
					AI_UNDO_HISTORY_METADATA_KEY,
					{
						before: undoHistoryBeforeSnapshot,
						after: createInlineHistorySnapshot(
							this._editor,
							this._state.sessions,
							this._state.activeSessionId ?? null,
							this._documentVersion,
							{ kind: "document-coupled" },
						),
					},
				);
			}
			return true;
		}
		const nextSession =
			this._state.sessions.find((item) => item.id === sessionId) ??
			session;
		this._updateSession(sessionId, {
			status: "complete",
			contextualPrompt: closeInlineSessionPrompt(nextSession),
		});
		if (undoHistoryBeforeSnapshot) {
			this._undoHistoryMetadata?.setCurrentEntryMetadata(
				AI_UNDO_HISTORY_METADATA_KEY,
				{
					before: undoHistoryBeforeSnapshot,
					after: createInlineHistorySnapshot(
						this._editor,
						this._state.sessions,
						this._state.activeSessionId ?? null,
						this._documentVersion,
						{ kind: "document-coupled" },
					),
				},
			);
		}
		return true;
	},

_createInlineTurnUndoBeforeSnapshot(this: any, 
		sessionId: string,
		turnId: string,
	): AIInlineHistorySnapshot {
		const session =
			this._state.sessions.find((item) => item.id === sessionId) ?? null;
		if (session?.surface === "inline-edit") {
			const reviewSnapshot =
				this._findInlineHistorySnapshotForResolvedTurn(session, "undo");
			if (reviewSnapshot) {
				const restoredSessions = reviewSnapshot.sessions.map(
					(snapshotSession) => {
						if (
							snapshotSession.id !== sessionId ||
							snapshotSession.surface !== "inline-edit" ||
							!snapshotSession.contextualPrompt
						) {
							return snapshotSession;
						}
						const snapshotTurn =
							snapshotSession.turns.find(
								(turn) => turn.id === turnId,
							) ?? null;
						if (!snapshotTurn) {
							return snapshotSession;
						}
						return {
							...snapshotSession,
							contextualPrompt: {
								...snapshotSession.contextualPrompt,
								composer: {
									...snapshotSession.contextualPrompt
										.composer,
									draftPrompt:
										snapshotSession.contextualPrompt
											.composer.draftPrompt ||
										snapshotTurn.prompt,
								},
							},
						};
					},
				);
				return createInlineHistorySnapshot(
					this._editor,
					restoredSessions,
					sessionId,
					this._documentVersion,
					{ kind: "document-coupled" },
				);
			}
		}
		const historySessions = this._state.sessions.map((session) => {
			if (
				session.id !== sessionId ||
				session.surface !== "inline-edit" ||
				!session.contextualPrompt
			) {
				return session;
			}
			const targetTurn =
				session.turns.find((turn) => turn.id === turnId) ?? null;
			if (targetTurn?.status !== "review") {
				return session;
			}
			return {
				...session,
				contextualPrompt: {
					...session.contextualPrompt,
					composer: {
						...session.contextualPrompt.composer,
						isOpen: true,
						isSubmitting: false,
					},
				},
			};
		});
		const nextActiveSessionId = historySessions.some(
			(session) =>
				session.id === sessionId &&
				session.surface === "inline-edit" &&
				session.contextualPrompt?.composer.isOpen,
		)
			? sessionId
			: (this._state.activeSessionId ?? null);
		return createInlineHistorySnapshot(
			this._editor,
			historySessions,
			nextActiveSessionId,
			this._documentVersion,
			{ kind: "document-coupled" },
		);
	},

_updateSession(this: any, 
		sessionId: string,
		overrides: Partial<AISession>,
	): void {
		const nextSessions = this._state.sessions.map((session) =>
			session.id !== sessionId
				? session
				: {
						...session,
						...overrides,
						contextualPrompt:
							(overrides.contextualPrompt ??
							session.contextualPrompt)
								? {
										...(session.contextualPrompt ??
											resolveContextualPromptState(
												overrides.target ??
													session.target,
											)),
										...(overrides.contextualPrompt ?? {}),
										anchor: {
											...(
												session.contextualPrompt ??
												resolveContextualPromptState(
													overrides.target ??
														session.target,
												)
											).anchor,
											...(overrides.contextualPrompt
												?.anchor ?? {}),
										},
										composer: {
											...(
												session.contextualPrompt ??
												resolveContextualPromptState(
													overrides.target ??
														session.target,
												)
											).composer,
											...(overrides.contextualPrompt
												?.composer ?? {}),
											isSubmitting:
												overrides.contextualPrompt
													?.composer?.isSubmitting ??
												(overrides.status ===
												"streaming"
													? true
													: overrides.status
														? false
														: (
																session.contextualPrompt ??
																resolveContextualPromptState(
																	overrides.target ??
																		session.target,
																)
															).composer
																.isSubmitting),
										},
									}
								: undefined,
						updatedAt: Date.now(),
						metrics: {
							...session.metrics,
							...(overrides.metrics ?? {}),
						},
					},
		);
		if (nextSessions === this._state.sessions) {
			return;
		}
		this._setState({
			sessions: nextSessions,
			activeSessionId:
				this._state.activeSessionId === sessionId ||
				this._state.activeSessionId == null
					? sessionId
					: this._state.activeSessionId,
		});
	},

_recordSessionFastApplyMetrics(this: any, 
		sessionId: string,
		fastApply: FastApplyDebugState | undefined,
	): void {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return;
		}
		this._updateSession(sessionId, {
			metrics: {
				...session.metrics,
				fastApply: accumulateSessionFastApplyMetrics(
					session.metrics.fastApply,
					fastApply,
				),
			},
		});
	}
};
