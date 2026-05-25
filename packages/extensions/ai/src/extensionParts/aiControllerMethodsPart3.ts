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

export const aiControllerMethodsPart3 = {
acceptActiveGeneration(this: any): boolean {
		const generation = this._state.activeGeneration;
		if (!generation) {
			return false;
		}

		if (generation.suggestionIds && generation.suggestionIds.length > 0) {
			const existingSession =
				generation.sessionId != null
					? (this._state.sessions.find(
							(session) => session.id === generation.sessionId,
						) ?? null)
					: null;
			const existingTurn =
				generation.turnId != null
					? (existingSession?.turns.find(
							(turn) => turn.id === generation.turnId,
						) ?? null)
					: null;
			const refreshSuggestionIds = existingTurn?.suggestionIds.length
				? existingTurn.suggestionIds
				: generation.suggestionIds;
			const refreshedInlineSelectionTarget =
				generation.surface === "inline-edit"
					? (resolveAcceptedInlineSelectionTarget(
							this._editor,
							existingTurn?.operation ??
								generation.operation ??
								undefined,
							refreshSuggestionIds,
						) ?? resolveLiveInlineSelectionTarget(this._editor))
					: null;
			const accepted = acceptSuggestions(
				this._editor,
				generation.suggestionIds,
			);
			if (accepted) {
				this._resolveActiveGeneration({
					suggestionIds: [],
					structuredPreview: null,
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "accepted",
								suggestionIds: [],
								structuredPreview: null,
								anchor: refreshedInlineSelectionTarget
									? resolveSessionAnchor(
											refreshedInlineSelectionTarget.selection,
										)
									: undefined,
								selection: refreshedInlineSelectionTarget
									? resolveSessionSelectionSnapshot(
											refreshedInlineSelectionTarget.selection,
										)
									: undefined,
							},
						);
					}
					this._updateSession(generation.sessionId, {
						status: "complete",
						pendingSuggestionIds: [],
						...(refreshedInlineSelectionTarget
							? {
									target: refreshedInlineSelectionTarget,
									anchor: resolveSessionAnchor(
										refreshedInlineSelectionTarget.selection,
									),
									contextualPrompt:
										existingSession?.contextualPrompt
											? {
													...existingSession.contextualPrompt,
													anchor: resolveContextualPromptAnchor(
														refreshedInlineSelectionTarget,
													),
												}
											: undefined,
								}
							: {}),
					});
				}
			}
			return accepted;
		}

		if (generation.planState !== "validated" || !generation.plan) {
			return false;
		}

		const execution = buildDocumentMutationPlanExecution(
			this._editor,
			generation.plan,
		);
		if (execution.issues.length > 0) {
			this._resolveActiveGeneration({
				planState: "rejected",
			});
			return false;
		}

		this._editor.apply(execution.ops, { origin: "ai", undoGroup: true });
		this._resolveActiveGeneration({
			planState: "none",
			structuredPreview: null,
		});
		if (generation.sessionId) {
			if (generation.turnId) {
				this._updateSessionTurn(
					generation.sessionId,
					generation.turnId,
					{
						status: "accepted",
						reviewItemIds: [],
						structuredPreview: null,
					},
				);
			}
			this._updateSession(generation.sessionId, {
				status: "complete",
				pendingReviewItemIds: [],
			});
		}
		return true;
	},

rejectActiveGeneration(this: any): boolean {
		const generation = this._state.activeGeneration;
		if (!generation) return false;

		if (generation.suggestionIds && generation.suggestionIds.length > 0) {
			const rejected = rejectSuggestions(
				this._editor,
				generation.suggestionIds,
			);
			if (rejected) {
				this._resolveActiveGeneration({
					suggestionIds: [],
					planState: "rejected",
					structuredPreview: null,
				});
				if (generation.sessionId) {
					if (generation.turnId) {
						this._updateSessionTurn(
							generation.sessionId,
							generation.turnId,
							{
								status: "rejected",
								suggestionIds: [],
								structuredPreview: null,
							},
						);
					}
					this._updateSession(generation.sessionId, {
						status: "complete",
						pendingSuggestionIds: [],
					});
				}
			}
			return rejected;
		}

		if (generation.planState === "validated" && generation.plan) {
			this._resolveActiveGeneration({
				status: "cancelled",
				planState: "rejected",
				structuredPreview: null,
			});
			if (generation.sessionId) {
				if (generation.turnId) {
					this._updateSessionTurn(
						generation.sessionId,
						generation.turnId,
						{
							status: "rejected",
							reviewItemIds: [],
							structuredPreview: null,
						},
					);
				}
				this._updateSession(generation.sessionId, {
					status: "complete",
					pendingReviewItemIds: [],
				});
			}
			return true;
		}

		if (generation.status === "streaming") {
			this.cancelActiveGeneration();
		}

		return this._editor.undoManager.undo();
	},

acceptReviewItem(this: any, id: string): boolean {
		return this.acceptReviewItems([id]);
	},

rejectReviewItem(this: any, id: string): boolean {
		return this.rejectReviewItems([id]);
	},

acceptReviewItems(this: any, ids: readonly string[]): boolean {
		return this._applyReviewItems(ids, "accept");
	},

rejectReviewItems(this: any, ids: readonly string[]): boolean {
		return this._applyReviewItems(ids, "reject");
	},

_applyReviewItems(this: any, 
		ids: readonly string[],
		action: "accept" | "reject",
	): boolean {
		const generation = this._state.activeGeneration;
		if (
			!generation ||
			generation.planState !== "validated" ||
			!generation.plan ||
			!generation.reviewItems
		) {
			return false;
		}

		const reviewItems = resolveOrderedReviewItems(
			generation.reviewItems,
			ids,
		);
		if (reviewItems.length === 0) {
			return false;
		}

		if (action === "accept") {
			const selectedPlans = reviewItems.map((reviewItem) =>
				selectStructuralReviewItemPlan(generation.plan!, reviewItem),
			);
			if (selectedPlans.some((plan) => !plan)) {
				return false;
			}
			const resolvedSelectedPlans = selectedPlans.filter(
				(plan): plan is NonNullable<(typeof selectedPlans)[number]> =>
					plan != null,
			);

			const selectedPlan =
				resolvedSelectedPlans.length === 1
					? resolvedSelectedPlans[0]!
					: {
							kind: "review_bundle" as const,
							label: "Bulk review selection",
							reason: "Apply selected review items together.",
							plans: resolvedSelectedPlans,
						};
			const execution = buildDocumentMutationPlanExecution(
				this._editor,
				selectedPlan,
			);
			if (execution.issues.length > 0) {
				return false;
			}

			this._editor.apply(execution.ops, {
				origin: "ai",
				undoGroup: true,
			});
		}

		let nextPlan: GenerationState["plan"] = generation.plan;
		for (const reviewItem of sortReviewItemsForRemoval(reviewItems)) {
			if (!nextPlan) {
				break;
			}
			nextPlan = removeStructuralReviewItemPlan(nextPlan, reviewItem);
		}
		const nextReviewItems = nextPlan
			? buildStructuralReviewItems(this._editor, nextPlan)
			: [];
		this._resolveActiveGeneration({
			status:
				nextPlan || action === "accept"
					? generation.status
					: "cancelled",
			planState: nextPlan
				? "validated"
				: action === "accept"
					? "none"
					: "rejected",
			plan: nextPlan,
			reviewItems: nextReviewItems,
			structuredPreview: nextPlan
				? buildGenerationStructuredPreviewState(this._editor, {
						planState: "validated",
						plan: nextPlan,
					})
				: null,
		});
		if (generation.sessionId) {
			if (generation.turnId) {
				this._updateSessionTurn(
					generation.sessionId,
					generation.turnId,
					{
						status: nextPlan
							? "review"
							: action === "accept"
								? "accepted"
								: "rejected",
						reviewItemIds: nextReviewItems.map((item) => item.id),
					},
				);
			}
			this._updateSession(generation.sessionId, {
				status:
					nextPlan || action === "accept"
						? generation.status === "streaming"
							? "streaming"
							: "complete"
						: "complete",
				pendingReviewItemIds: nextReviewItems.map((item) => item.id),
			});
		}
		return true;
	}
};
