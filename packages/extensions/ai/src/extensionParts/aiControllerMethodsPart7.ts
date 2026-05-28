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

export const aiControllerMethodsPart7 = {
_commitRequestedOperationResult(this: any, 
		operation: AIRequestedOperation,
		text: string,
		sessionId: string | undefined,
		options: {
			contentFormat: AIContentFormat;
			applyStrategy?: AIApplyStrategy;
		},
	): AIMutationReceipt {
		const conflictReason = resolveRequestedOperationConflict(
			this._editor,
			operation,
			this._createSelectionSignature(this._editor.selection),
		);
		if (conflictReason) {
			return buildMutationReceipt({
				status: "invalid",
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
				issues: [conflictReason],
			});
		}

		if (operation.kind === "rewrite-selection") {
			const selection = resolveSelectionForRequestedOperation(
				this._editor,
				operation,
			);
			if (!selection) {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: [
						"The requested selection rewrite target is no longer available.",
					],
				});
			}
			const markdownBlockIds =
				options.contentFormat === "markdown" &&
				operation.target.kind === "scoped-range" &&
				operation.target.blockIds.length > 0
					? operation.target.blockIds
					: null;
			if (markdownBlockIds) {
				return this._commitBufferedBlockGeneration(
					markdownBlockIds[0],
					text,
					"persistent-suggestions",
					"markdown",
					sessionId,
					{
						applyStrategy: options.applyStrategy,
						replaceTargetBlock: true,
						replaceBlockIds: markdownBlockIds,
					},
				);
			}
			return this._commitSelectionRewrite(
				selection,
				text,
				"persistent-suggestions",
				sessionId,
			);
		}

		if (operation.kind === "rewrite-block") {
			const target =
				operation.target.kind === "block" ? operation.target : null;
			if (!target) {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: ["The requested block rewrite target is invalid."],
				});
			}
			const selection = resolveFullBlockTextSelection(
				this._editor,
				target.blockId,
			);
			if (selection && options.contentFormat === "text") {
				return this._commitSelectionRewrite(
					selection,
					text,
					"persistent-suggestions",
					sessionId,
				);
			}
			return this._commitBufferedBlockGeneration(
				target.blockId,
				text,
				"persistent-suggestions",
				options.contentFormat,
				sessionId,
				{
					applyStrategy: options.applyStrategy,
					replaceTargetBlock: true,
				},
			);
		}

		if (operation.kind === "document-transform") {
			const target =
				operation.target.kind === "document" ? operation.target : null;
			if (!target) {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: [
						"The requested document transform target is invalid.",
					],
				});
			}
			const replaceBlockIds = target.blockIds?.filter(
				(blockId) => this._editor.getBlock(blockId) != null,
			);
			if (target.transform === "remove") {
				const deleteBlockIds =
					replaceBlockIds && replaceBlockIds.length > 0
						? replaceBlockIds
						: this._editor.documentState.blockOrder.filter(
								(blockId) =>
									this._editor.getBlock(blockId) != null,
							);
				const ops = deleteBlockIds.map((blockId) => ({
					type: "delete-block" as const,
					blockId,
				}));
				if (ops.length === 0) {
					return buildMutationReceipt({
						status: "noop",
						adapterId: "flow-markdown",
						blockClass: "flow",
						transportKind: "flow-text",
					});
				}
				this._applySuggestedAIOps(ops, sessionId);
				return buildMutationReceipt({
					status: "staged_suggestions",
					ops,
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			}
			const targetBlockId =
				target.activeBlockId ??
				replaceBlockIds?.[0] ??
				this._editor.lastBlock()?.id ??
				this._editor.firstBlock()?.id ??
				null;
			if (!targetBlockId) {
				return buildMutationReceipt({
					status: "invalid",
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
					issues: [
						"The requested document transform target is no longer available.",
					],
				});
			}
			return this._commitBufferedBlockGeneration(
				targetBlockId,
				text,
				"persistent-suggestions",
				options.contentFormat,
				sessionId,
				{
					applyStrategy: options.applyStrategy,
					replaceTargetBlock:
						target.placement === "replace-blocks" ||
						target.placement === "replace-empty-block" ||
						(replaceBlockIds?.length ?? 0) > 0,
					replaceBlockIds,
				},
			);
		}

		const target =
			operation.target.kind === "block" ? operation.target : null;
		if (!target) {
			return buildMutationReceipt({
				status: "invalid",
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
				issues: ["The requested continuation target is invalid."],
			});
		}
		return this._commitBufferedBlockGeneration(
			target.blockId,
			text,
			"persistent-suggestions",
			"text",
			sessionId,
			{
				insertionOffset: target.insertionOffset,
			},
		);
	},

_commitSelectionRewrite(this: any, 
		selection: TextSelection,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId?: string,
	): AIMutationReceipt {
		const selectedText = resolveSelectionText(this._editor, selection);
		const ops = buildSelectionReplacementOps(this._editor, selection, text);
		if (
			mutationMode === "persistent-suggestions" ||
			mutationMode === "streaming-suggestions" ||
			mutationMode === "staged-review"
		) {
			this._applySuggestedAIOps(ops, sessionId);
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				executionPath: "native-fast-apply",
				contextChars: selectedText.length,
				diffChars: text.length,
			});
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}
		this._editor.selectTextRange(selection.anchor, selection.focus);
		this._editor.deleteSelection({ origin: "ai" });
		const nextSelection = this._editor.selection;
		if (nextSelection?.type !== "text") {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: selectedText.length,
				diffChars: text.length,
				fallbackReason: "selection-lost",
			});
			return buildMutationReceipt({
				status: "invalid",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
				issues: ["Selection rewrite lost the active text selection."],
			});
		}
		const caret = nextSelection.anchor;
		if (text.length > 0) {
			this._editor.apply(
				[
					{
						type: "insert-text",
						blockId: caret.blockId,
						offset: caret.offset,
						text,
					},
				],
				{ origin: "ai" },
			);
		}
		this._editor.selectTextRange(
			{
				blockId: caret.blockId,
				offset: caret.offset + text.length,
			},
			{
				blockId: caret.blockId,
				offset: caret.offset + text.length,
			},
		);
		this._recordFastApplyDebug({
			attempted: true,
			succeeded: true,
			executionPath: "native-fast-apply",
			contextChars: selectedText.length,
			diffChars: text.length,
		});
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	}
};
