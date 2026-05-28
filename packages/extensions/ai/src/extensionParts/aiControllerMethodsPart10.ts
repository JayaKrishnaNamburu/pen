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

export const aiControllerMethodsPart10 = {
_resolvePlanValidationTargetKind(this: any, blockId: string): AITargetKind {
		const blockType = this._editor.getBlock(blockId)?.type ?? null;
		if (blockType === "database") {
			return "database";
		}
		if (blockType === "table") {
			return "table";
		}
		return "block";
	},

_verifyMarkdownFastApplyResult(this: any, 
		blockIds: readonly string[],
		markdown: string,
	): { valid: boolean; reason?: string } {
		if (markdown.trim().length === 0) {
			return { valid: false, reason: "empty-merged-markdown" };
		}
		const startBlockId = blockIds[0];
		const verificationResult = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: markdown,
			position: startBlockId ? { before: startBlockId } : undefined,
			surface: "ai-markdown-fast-apply-verify",
		});
		if (verificationResult.blocks.length === 0) {
			return {
				valid: false,
				reason: "markdown-parse-produced-no-blocks",
			};
		}
		return { valid: true };
	},

_verifyFlowPatchPlanResult(this: any, 
		plan: {
			edits: Array<{
				locator: { blockId?: string; blockIds?: string[] };
			}>;
		},
		ops: readonly DocumentOp[],
		scopeBlockIds: readonly string[],
	): {
		valid: boolean;
		reason?: string;
		untouchedBlockMutationCount: number;
	} {
		const targetedBlockIds = new Set<string>(
			plan.edits.flatMap((edit) => [
				...(edit.locator.blockId ? [edit.locator.blockId] : []),
				...(edit.locator.blockIds ?? []),
			]),
		);
		const scopeSet = new Set(scopeBlockIds);
		const mutatedExistingBlockIds = new Set<string>();
		const outOfScopeMutations = new Set<string>();
		const createdBlockIds = new Set<string>();

		for (const op of ops) {
			if (op.type === "insert-block") {
				createdBlockIds.add(op.blockId);
			}
			for (const blockId of this._readBlockIdsFromOp(op)) {
				if (scopeSet.has(blockId)) {
					mutatedExistingBlockIds.add(blockId);
				} else if (
					!createdBlockIds.has(blockId) &&
					op.type !== "insert-block"
				) {
					outOfScopeMutations.add(blockId);
				}
			}
		}

		if (outOfScopeMutations.size > 0) {
			return {
				valid: false,
				reason: `flow-patch-mutated-outside-scope:${[...outOfScopeMutations].join(",")}`,
				untouchedBlockMutationCount: 0,
			};
		}

		const untouchedBlockMutationCount = [...mutatedExistingBlockIds].filter(
			(blockId) => !targetedBlockIds.has(blockId),
		).length;
		return {
			valid: untouchedBlockMutationCount === 0,
			reason:
				untouchedBlockMutationCount > 0
					? "flow-patch-mutated-untargeted-blocks"
					: undefined,
			untouchedBlockMutationCount,
		};
	},

_buildMarkdownScopedReplacementOps(this: any, 
		blockIds: readonly string[],
		text: string,
	): DocumentOp[] {
		const startBlockId = blockIds[0];
		if (!startBlockId) {
			return [];
		}
		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { before: startBlockId },
			surface: "ai-markdown-fast-apply",
		});
		return [
			...ops,
			...blockIds.map(
				(currentBlockId) =>
					({
						type: "delete-block",
						blockId: currentBlockId,
					}) satisfies DocumentOp,
			),
		];
	},

_summarizeFastApplyFallbackOps(this: any, 
		kind: "scoped-replacement" | "plain-markdown",
		ops: readonly DocumentOp[],
		targetBlockCount?: number,
	): {
		kind: "scoped-replacement" | "plain-markdown";
		opsCount: number;
		insertedBlockCount: number;
		deletedBlockCount: number;
		targetBlockCount?: number;
	} {
		let insertedBlockCount = 0;
		let deletedBlockCount = 0;
		for (const op of ops) {
			if (op.type === "insert-block") {
				insertedBlockCount += 1;
			} else if (op.type === "delete-block") {
				deletedBlockCount += 1;
			}
		}
		return {
			kind,
			opsCount: ops.length,
			insertedBlockCount,
			deletedBlockCount,
			targetBlockCount,
		};
	},

_readBlockIdsFromOp(this: any, op: DocumentOp): string[] {
		const blockIds = new Set<string>();
		if ("blockId" in op && typeof op.blockId === "string") {
			blockIds.add(op.blockId);
		}
		if ("targetBlockId" in op && typeof op.targetBlockId === "string") {
			blockIds.add(op.targetBlockId);
		}
		if ("sourceBlockId" in op && typeof op.sourceBlockId === "string") {
			blockIds.add(op.sourceBlockId);
		}
		return [...blockIds];
	},

_recordFastApplyDebug(this: any, 
		overrides: Partial<
			NonNullable<NonNullable<GenerationState["debug"]>["fastApply"]>
		>,
	): void {
		const activeGeneration = this._state.activeGeneration;
		if (!activeGeneration?.debug) {
			return;
		}
		const currentFastApply = activeGeneration.debug.fastApply ?? {
			attempted: false,
			succeeded: false,
		};
		this._resolveActiveGeneration({
			debug: {
				...activeGeneration.debug,
				fastApply: {
					...currentFastApply,
					...overrides,
				},
			},
		});
	},

_applySuggestedMarkdownPlaceholderReplacement(this: any, 
		blockId: string,
		text: string,
		sessionId?: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): DocumentOp[] | null {
		const targetBlock = this._editor.getBlock(blockId);
		if (
			!replaceTargetBlock &&
			!shouldReplaceEmptyMarkdownTarget(targetBlock)
		) {
			return null;
		}

		const { ops } = buildDocumentWriteOps(this._editor, {
			format: "markdown",
			content: text,
			position: { before: blockId },
			surface: "ai-markdown",
		});
		if (ops.length === 0) {
			return null;
		}

		const deleteBlockIds = resolveReplacementDeleteBlockIds(
			this._editor,
			blockId,
			replaceBlockIds,
		);
		const replacementOps = [
			...ops,
			...deleteBlockIds.map((nextBlockId) => ({
				type: "delete-block" as const,
				blockId: nextBlockId,
			})),
		] satisfies DocumentOp[];
		this._applySuggestedAIOps(replacementOps, sessionId);
		return replacementOps;
	},

_refreshStreamingMarkdownBlockPreview(this: any, 
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		baselineSuggestionIds: ReadonlySet<string>,
		previewSuggestionIds: readonly string[],
		previousNormalizedText: string,
		replaceTargetBlock?: boolean,
		replaceBlockIds?: readonly string[],
	): { suggestionIds: string[]; normalizedText: string } {
		const normalizedText = normalizeFlowMarkdownOutput(text);
		if (normalizedText === previousNormalizedText) {
			return {
				suggestionIds: [...previewSuggestionIds],
				normalizedText,
			};
		}

		this._rejectPreviewSuggestions(previewSuggestionIds);

		if (
			normalizedText.trim().length === 0 &&
			!replaceTargetBlock &&
			(replaceBlockIds?.length ?? 0) === 0
		) {
			return {
				suggestionIds: [],
				normalizedText,
			};
		}

		this._commitBufferedBlockGeneration(
			blockId,
			normalizedText,
			mutationMode,
			"markdown",
			sessionId,
			{ replaceTargetBlock, replaceBlockIds },
		);

		return {
			suggestionIds: this.getSuggestions()
				.map((item) => item.id)
				.filter(
					(suggestionId) => !baselineSuggestionIds.has(suggestionId),
				),
			normalizedText,
		};
	},

_commitStructuredPlan(this: any, 
		ops: DocumentOp[],
		reviewSafe: boolean,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		adapterId: NonNullable<GenerationState["adapterId"]>,
		blockClass: NonNullable<GenerationState["blockClass"]>,
		transportKind: NonNullable<GenerationState["transportKind"]>,
	): AIMutationReceipt {
		if (ops.length === 0) {
			return buildMutationReceipt({
				status: "noop",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}

		if (mutationMode === "direct-stream") {
			this._editor.apply(ops, { origin: "ai", undoGroup: true });
			return buildMutationReceipt({
				status: "applied",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}

		if (reviewSafe) {
			this._applySuggestedAIOps(ops);
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId,
				blockClass,
				transportKind,
			});
		}
		return buildMutationReceipt({
			status: "staged_review",
			ops,
			adapterId,
			blockClass,
			transportKind,
		});
	}
};
