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

export const aiControllerMethodsPart11 = {
_buildFallbackMutationReceipt(this: any, input: {
		currentText: string;
		suggestionIds: readonly string[];
		reviewItems: readonly StructuralReviewItem[];
		planExecutionIssueCount: number;
		adapterId: NonNullable<GenerationState["adapterId"]>;
		blockClass: NonNullable<GenerationState["blockClass"]>;
		transportKind: NonNullable<GenerationState["transportKind"]>;
	}): AIMutationReceipt {
		if (input.planExecutionIssueCount > 0) {
			return buildMutationReceipt({
				status: "invalid",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
				issues: ["The generated mutation plan could not be executed."],
			});
		}
		if (input.reviewItems.length > 0) {
			return buildMutationReceipt({
				status: "staged_review",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
			});
		}
		if (input.suggestionIds.length > 0) {
			return buildMutationReceipt({
				status: "staged_suggestions",
				adapterId: input.adapterId,
				blockClass: input.blockClass,
				transportKind: input.transportKind,
			});
		}
		return buildMutationReceipt({
			status: input.currentText.trim().length > 0 ? "applied" : "noop",
			adapterId: input.adapterId,
			blockClass: input.blockClass,
			transportKind: input.transportKind,
		});
	},

async _buildWorkingSet(this: any, 
		toolRuntime: ToolRuntime,
		route: ReturnType<typeof routeAIRequest>,
		target: GenerationTarget,
		blockId: string,
		prompt: string,
	): Promise<AIWorkingSetEnvelope | null> {
		const selectionSignature = this._createSelectionSignature(
			this._editor.selection,
		);
		if (target.type === "selection") {
			const trackedBlockIds = [
				...new Set(target.selection.toRange().blockRange),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "selection",
				routeConfidence: route.confidence,
				context: {
					selection: target.selection,
					selectedText: resolveSelectionText(
						this._editor,
						target.selection,
					),
				},
				trackedBlockIds,
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useCursorContext) {
			const retrievedSpan =
				await this._resolveMarkdownFastApplyRetrievedSpan(
					toolRuntime,
					route,
					blockId,
					prompt,
				);
			if (
				route.applyStrategy === "markdown-fast-apply" &&
				retrievedSpan
			) {
				const context = (await toolRuntime.executeTool(
					"get_context",
					{
						format: "markdown",
						includeSelection: true,
						includeSuggestions: this._state.suggestMode,
						range: retrievedSpan.range,
					},
					{} as never,
				)) as {
					activeBlockType?: string | null;
					markdown?: string | null;
					surroundingBlocks?: Array<{ id: string }>;
					selectedText?: string | null;
					structuredTarget?: {
						target?: {
							kind?: "block" | "table" | "database";
						};
					} | null;
				};
				return {
					documentVersion: this._documentVersion,
					viewMode: this._state.suggestMode ? "raw" : "resolved",
					source: "cursor-context",
					context: {
						...context,
						retrievedSpan,
					},
					routeConfidence: refineRouteWithNavigator(route, {
						surroundingBlockCount: retrievedSpan.blockIds.length,
						selectedTextLength: context.selectedText?.length ?? 0,
						activeBlockType: context.activeBlockType ?? null,
						structuredTargetKind:
							context.structuredTarget?.target?.kind ?? null,
					}).confidence,
					trackedBlockIds: [...new Set(retrievedSpan.blockIds)],
					blockRevisions: this._captureBlockRevisions(
						retrievedSpan.blockIds,
					),
					selectionSignature,
				};
			}
			const context = (await toolRuntime.executeTool(
				"get_cursor_context",
				{ includeSuggestions: this._state.suggestMode },
				{} as never,
			)) as {
				activeBlockType?: string | null;
				markdown?: string | null;
				surroundingBlocks?: Array<{ id: string }>;
				selectedText?: string | null;
				structuredTarget?: {
					target?: {
						kind?: "block" | "table" | "database";
					};
				} | null;
			};
			const trackedBlockIds = [
				blockId,
				...(context.surroundingBlocks ?? []).map((block) => block.id),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "cursor-context",
				context,
				routeConfidence: refineRouteWithNavigator(route, {
					surroundingBlockCount:
						context.surroundingBlocks?.length ?? 0,
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
				selectionSignature,
			};
		}

		if (route.useDocumentSummary) {
			const retrievedSpan =
				await this._resolveMarkdownFastApplyRetrievedSpan(
					toolRuntime,
					route,
					blockId,
					prompt,
				);
			if (
				route.applyStrategy === "markdown-fast-apply" &&
				retrievedSpan
			) {
				const context = (await toolRuntime.executeTool(
					"get_context",
					{
						format: "markdown",
						includeSelection: true,
						includeSuggestions: this._state.suggestMode,
						range: retrievedSpan.range,
					},
					{} as never,
				)) as {
					activeBlockType?: string | null;
					markdown?: string | null;
					surroundingBlocks?: Array<{ id: string }>;
					selectedText?: string | null;
					structuredTarget?: {
						target?: {
							kind?: "block" | "table" | "database";
						};
					} | null;
				};
				return {
					documentVersion: this._documentVersion,
					viewMode: this._state.suggestMode ? "raw" : "resolved",
					source: "document-summary",
					context: {
						...context,
						retrievedSpan,
					},
					routeConfidence: refineRouteWithNavigator(route, {
						surroundingBlockCount: retrievedSpan.blockIds.length,
						selectedTextLength: context.selectedText?.length ?? 0,
						activeBlockType: context.activeBlockType ?? null,
						structuredTargetKind:
							context.structuredTarget?.target?.kind ?? null,
					}).confidence,
					trackedBlockIds: [...new Set(retrievedSpan.blockIds)],
					blockRevisions: this._captureBlockRevisions(
						retrievedSpan.blockIds,
					),
					selectionSignature,
				};
			}
			const context = (await toolRuntime.executeTool(
				"get_context",
				{
					format: "markdown",
					includeSelection: true,
					includeSuggestions: this._state.suggestMode,
					range: {
						startBlockId: blockId,
						endBlockId: blockId,
					},
				},
				{} as never,
			)) as {
				activeBlockType?: string | null;
				markdown?: string | null;
				surroundingBlocks?: Array<{ id: string }>;
				selectedText?: string | null;
				structuredTarget?: {
					target?: {
						kind?: "block" | "table" | "database";
					};
				} | null;
			};
			const trackedBlockIds = [
				blockId,
				...(context.surroundingBlocks ?? []).map((block) => block.id),
			];
			return {
				documentVersion: this._documentVersion,
				viewMode: this._state.suggestMode ? "raw" : "resolved",
				source: "document-summary",
				context,
				routeConfidence: refineRouteWithNavigator(route, {
					surroundingBlockCount:
						context.surroundingBlocks?.length ?? 0,
					selectedTextLength: context.selectedText?.length ?? 0,
					activeBlockType: context.activeBlockType ?? null,
					structuredTargetKind:
						context.structuredTarget?.target?.kind ?? null,
				}).confidence,
				trackedBlockIds: [...new Set(trackedBlockIds)],
				blockRevisions: this._captureBlockRevisions(trackedBlockIds),
				selectionSignature,
			};
		}

		return {
			documentVersion: this._documentVersion,
			viewMode: this._state.suggestMode ? "raw" : "resolved",
			source: "document-summary",
			context: null,
			routeConfidence: route.confidence,
			trackedBlockIds: [blockId],
			blockRevisions: this._captureBlockRevisions([blockId]),
			selectionSignature,
		};
	},

_refineRouteWithWorkingSet(this: any, 
		route: ReturnType<typeof routeAIRequest>,
		workingSet: AIWorkingSetEnvelope | null,
	): ReturnType<typeof routeAIRequest> {
		if (!workingSet?.context || typeof workingSet.context !== "object") {
			return route;
		}
		const context = workingSet.context as {
			activeBlockType?: string | null;
			markdown?: string | null;
			surroundingBlocks?: Array<{ id: string }>;
			selectedText?: string | null;
			structuredTarget?: {
				target?: {
					kind?: "block" | "table" | "database";
				};
			} | null;
		};
		return refineRouteWithNavigator(route, {
			surroundingBlockCount: context.surroundingBlocks?.length ?? 0,
			selectedTextLength: context.selectedText?.length ?? 0,
			activeBlockType: context.activeBlockType ?? null,
			structuredTargetKind:
				context.structuredTarget?.target?.kind ?? null,
		});
	}
};
