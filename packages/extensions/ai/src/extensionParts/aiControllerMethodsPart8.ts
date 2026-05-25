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

export const aiControllerMethodsPart8 = {
_commitBufferedBlockGeneration(this: any, 
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
	): AIMutationReceipt {
		let fastApplyFallbackMode: "plain-markdown" | null = null;
		if (
			contentFormat === "markdown" &&
			options?.applyStrategy === "markdown-fast-apply" &&
			(options?.replaceBlockIds?.length ?? 0) === 0
		) {
			const fastApplyReceipt = this._commitBufferedMarkdownFastApply(
				blockId,
				text,
				mutationMode,
				sessionId,
				options.workingSet ?? null,
			);
			if (fastApplyReceipt) {
				return fastApplyReceipt;
			}
			if (!text.trim().startsWith(`<${MARKDOWN_FAST_APPLY_ROOT_TAG}>`)) {
				// Backward compatibility: tolerate plain markdown when the model
				// does not honor the fast-apply contract.
				fastApplyFallbackMode = "plain-markdown";
			} else {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: [
						"Fast apply contract could not be compiled safely.",
					],
				});
			}
		}

		const normalizedText =
			contentFormat === "markdown"
				? normalizeFlowMarkdownOutput(text)
				: text;
		const scopedReplaceBlockIds =
			contentFormat === "markdown"
				? (options?.replaceBlockIds?.filter(
						(candidateBlockId, index, allBlockIds) =>
							allBlockIds.indexOf(candidateBlockId) === index &&
							this._editor.getBlock(candidateBlockId) != null,
					) ?? [])
				: [];
		if (contentFormat === "markdown" && scopedReplaceBlockIds.length > 0) {
			if (normalizedText.trim().length > 0) {
				const verification = this._verifyMarkdownFastApplyResult(
					scopedReplaceBlockIds,
					normalizedText,
				);
				if (!verification.valid) {
					return buildMutationReceipt({
						status: "invalid",
						adapterId: "flow-markdown",
						blockClass: "flow",
						transportKind: "flow-text",
						issues: [
							"Scoped markdown replacement could not be verified safely.",
						],
					});
				}
			}
			const ops = this._buildMarkdownScopedReplacementOps(
				scopedReplaceBlockIds,
				normalizedText,
			);
			const scopedReplacementFallback =
				this._summarizeFastApplyFallbackOps(
					"scoped-replacement",
					ops,
					scopedReplaceBlockIds.length,
				);
			if (
				mutationMode === "persistent-suggestions" ||
				mutationMode === "streaming-suggestions" ||
				mutationMode === "staged-review"
			) {
				this._applySuggestedAIOps(ops, sessionId);
				this._recordFastApplyDebug({
					executionPath: "scoped-replacement",
					fallback: scopedReplacementFallback,
				});
				return buildMutationReceipt({
					status: ops.length > 0 ? "staged_suggestions" : "noop",
					ops,
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			}
			this._editor.apply(ops, { origin: "ai", undoGroup: true });
			this._recordFastApplyDebug({
				executionPath: "scoped-replacement",
				fallback: scopedReplacementFallback,
			});
			return buildMutationReceipt({
				status: ops.length > 0 ? "applied" : "noop",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		if (
			contentFormat === "markdown" &&
			(mutationMode === "persistent-suggestions" ||
				mutationMode === "streaming-suggestions" ||
				mutationMode === "staged-review") &&
			this._applySuggestedMarkdownPlaceholderReplacement(
				blockId,
				normalizedText,
				sessionId,
				options?.replaceTargetBlock,
				options?.replaceBlockIds,
			)
		) {
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						[],
					),
				});
			}
			return buildMutationReceipt({
				status: "staged_suggestions",
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		const ops =
			contentFormat === "markdown"
				? this._buildMarkdownBlockGenerationOps(
						blockId,
						normalizedText,
						options?.replaceTargetBlock,
						options?.replaceBlockIds,
					)
				: this._buildTextBlockGenerationOps(
						blockId,
						normalizedText,
						options?.insertionOffset,
					);
		if (ops.length === 0) {
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						ops,
					),
				});
			}
			return buildMutationReceipt({
				status: "noop",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		if (
			mutationMode === "persistent-suggestions" ||
			mutationMode === "streaming-suggestions" ||
			mutationMode === "staged-review"
		) {
			this._applySuggestedAIOps(ops, sessionId);
			if (fastApplyFallbackMode) {
				this._recordFastApplyDebug({
					executionPath: "plain-markdown",
					fallback: this._summarizeFastApplyFallbackOps(
						"plain-markdown",
						ops,
					),
				});
			}
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		this._editor.apply(ops, { origin: "ai", undoGroup: true });
		if (fastApplyFallbackMode) {
			this._recordFastApplyDebug({
				executionPath: "plain-markdown",
				fallback: this._summarizeFastApplyFallbackOps(
					"plain-markdown",
					ops,
				),
			});
		}
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	}
};
