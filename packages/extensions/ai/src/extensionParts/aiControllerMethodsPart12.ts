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

export const aiControllerMethodsPart12 = {
_validateWorkingSet(this: any, 
		route: ReturnType<typeof routeAIRequest>,
		target: GenerationTarget,
		workingSet: AIWorkingSetEnvelope | null,
	): { valid: boolean; canRefresh: boolean; reason?: string } {
		if (!workingSet) {
			return { valid: true, canRefresh: false };
		}

		const selectionSignature = this._createSelectionSignature(
			this._editor.selection,
		);
		const selectionChanged =
			workingSet.selectionSignature !== selectionSignature;
		const revisionChanged =
			workingSet.documentVersion !== this._documentVersion ||
			workingSet.trackedBlockIds.some(
				(blockId) =>
					this._editor.getBlockRevision(blockId) !==
					workingSet.blockRevisions[blockId],
			);

		if (!selectionChanged && !revisionChanged) {
			return { valid: true, canRefresh: false };
		}

		if (
			route.lane === "selection-rewrite" ||
			route.lane === "cursor-context"
		) {
			return {
				valid: false,
				canRefresh: false,
				reason: selectionChanged
					? "selection-provenance-changed"
					: "local-context-changed",
			};
		}

		return {
			valid: false,
			canRefresh: target.type === "block",
			reason: revisionChanged
				? "document-revision-mismatch"
				: "selection-changed",
		};
	},

_resolveMarkdownFastApplyWindow(this: any, 
		route: ReturnType<typeof routeAIRequest>,
		blockId: string,
	): {
		range: { startBlockId: string; endBlockId: string };
		blockIds: string[];
	} | null {
		const blocks = Array.from(this._editor.blocks());
		const blockIndex = blocks.findIndex((block) => block.id === blockId);
		if (blockIndex === -1) {
			return null;
		}

		const radius =
			route.targetKind === "table"
				? 0
				: route.intent === "continue"
					? 0
					: route.intent === "rewrite" ||
						  route.intent === "local-edit"
						? 1
						: 0;
		const startIndex = Math.max(0, blockIndex - radius);
		const endIndex = Math.min(blocks.length - 1, blockIndex + radius);
		const blockIds = blocks
			.slice(startIndex, endIndex + 1)
			.map((block) => block.id);
		return {
			range: {
				startBlockId: blockIds[0] ?? blockId,
				endBlockId: blockIds[blockIds.length - 1] ?? blockId,
			},
			blockIds,
		};
	},

async _resolveMarkdownFastApplyRetrievedSpan(this: any, 
		toolRuntime: ToolRuntime,
		route: ReturnType<typeof routeAIRequest>,
		blockId: string,
		prompt: string,
	): Promise<AIWorkingSetRetrievedSpan | null> {
		if (route.applyStrategy !== "markdown-fast-apply") {
			return null;
		}

		try {
			const retrieved = (await toolRuntime.executeTool(
				"retrieve_document_spans",
				{
					query: prompt,
					maxResults: 1,
					includeSuggestions: this._state.suggestMode,
					activeBlockId: blockId,
					targetBlockId: blockId,
				},
				{} as never,
			)) as {
				spans?: AIWorkingSetRetrievedSpan[];
			};
			const retrievedSpan = retrieved.spans?.[0] ?? null;
			if (retrievedSpan?.blockIds?.length) {
				return retrievedSpan;
			}
		} catch {
			// Older test fixtures or stale builds may not register the retriever yet.
		}

		const markdownWindow = this._resolveMarkdownFastApplyWindow(
			route,
			blockId,
		);
		if (!markdownWindow) {
			return null;
		}
		return {
			id: `span:${markdownWindow.blockIds.join(":")}`,
			blockIds: markdownWindow.blockIds,
			range: markdownWindow.range,
			blockTypes: [],
			headingPath: [],
			preview: "",
			markdown: "",
			score: 0,
			rationale: "window-fallback",
			neighbors: {
				beforeBlockId: null,
				afterBlockId: null,
			},
		};
	},

_applySuggestedAIOps(this: any, 
		ops: DocumentOp[],
		sessionId?: string,
		options?: { undoGroupId?: string },
	): void {
		this._suggestedOperationRunner.apply(ops, sessionId, options);
	},

_captureBlockRevisions(this: any, blockIds: string[]): Record<string, number> {
		return Object.fromEntries(
			blockIds.map((trackedBlockId) => [
				trackedBlockId,
				this._editor.getBlockRevision(trackedBlockId),
			]),
		);
	},

_resolveContentFormat(this: any, 
		target: GenerationState["target"],
		surface?: AISurface,
	): AIContentFormat {
		if (target === "selection") {
			return this._contentFormat.selectionRewrite;
		}
		return this._contentFormat.blockGeneration;
	},

_buildTextBlockGenerationOps(this: any, 
		blockId: string,
		text: string,
		insertionOffset?: number,
	): DocumentOp[] {
		const targetBlock = this._editor.getBlock(blockId);
		const normalizedText = shouldTrimLeadingBlankBlockGenerationText(
			targetBlock,
		)
			? trimLeadingBlankBlockGenerationText(text)
			: text;
		if (normalizedText.length === 0) {
			return [];
		}
		return [
			{
				type: "insert-text",
				blockId,
				offset:
					insertionOffset ?? targetBlock?.textContent().length ?? 0,
				text: normalizedText,
			},
		];
	},

_buildMarkdownBlockGenerationOps(this: any, 
		blockId: string,
		text: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[] {
		const targetBlock = this._editor.getBlock(blockId);
		if (!targetBlock) {
			return [];
		}

		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { after: blockId },
			surface: "ai-markdown",
		});
		if (
			!replaceTargetBlock &&
			!shouldReplaceEmptyMarkdownTarget(targetBlock)
		) {
			return ops;
		}

		const deleteBlockIds = resolveReplacementDeleteBlockIds(
			this._editor,
			blockId,
			replaceBlockIds,
		);
		return [
			...ops,
			...deleteBlockIds.map((nextBlockId) => ({
				type: "delete-block" as const,
				blockId: nextBlockId,
			})),
		];
	},

_createSelectionSignature(this: any, 
		selection: SelectionState,
	): string | null {
		if (!selection) {
			return null;
		}
		if (selection.type === "text") {
			return [
				"text",
				selection.anchor.blockId,
				selection.anchor.offset,
				selection.focus.blockId,
				selection.focus.offset,
				String(selection.isCollapsed),
			].join(":");
		}
		if (selection.type === "block") {
			return `block:${selection.blockIds.join(",")}`;
		}
		if (selection.type === "cell") {
			return [
				"cell",
				selection.blockId,
				selection.anchor.row,
				selection.anchor.col,
				selection.head.row,
				selection.head.col,
			].join(":");
		}
		return selection.type;
	},

_setState(this: any, partial: Partial<AIControllerState>): void {
		const previousState = this._state;
		const nextState = { ...this._state, ...partial };
		if (areAIControllerStatesEqual(previousState, nextState)) {
			return;
		}
		this._state = nextState;
		if (
			!this._isRestoringInlineHistory &&
			!this._pendingInlineHistoryRestore
		) {
			this._recordInlineHistorySnapshot(previousState, nextState);
		}
		this._editor.requestDecorationUpdate();
		this._emit();
	},

_resolveActiveGeneration(this: any, 
		overrides: Partial<GenerationState>,
	): void {
		const activeGeneration = this._state.activeGeneration;
		if (!activeGeneration) {
			return;
		}

		this._setState({
			activeGeneration: {
				...activeGeneration,
				...overrides,
				plan:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? null
						: (overrides.plan ?? activeGeneration.plan),
				reviewItems:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? []
						: (overrides.reviewItems ??
							activeGeneration.reviewItems ??
							[]),
				structuredPreview:
					overrides.planState === "none" ||
					overrides.planState === "rejected"
						? null
						: (overrides.structuredPreview ??
							activeGeneration.structuredPreview ??
							null),
				suggestionIds:
					overrides.suggestionIds ??
					activeGeneration.suggestionIds ??
					[],
			},
		});
	}
};
