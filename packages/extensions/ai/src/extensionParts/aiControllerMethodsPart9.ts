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

export const aiControllerMethodsPart9 = {
_commitBufferedMarkdownFastApply(this: any, 
		blockId: string,
		text: string,
		mutationMode: NonNullable<GenerationState["mutationMode"]>,
		sessionId: string | undefined,
		workingSet: AIWorkingSetEnvelope | null,
	): AIMutationReceipt | null {
		const fastApplyScope = this._resolveMarkdownFastApplyScope(
			blockId,
			workingSet,
		);
		if (!fastApplyScope) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				fallbackReason: "missing-scope",
			});
			return null;
		}

		const patchPlan = parseMarkdownPatchPlanContract(text);
		if (patchPlan) {
			const validation = validateDocumentMutationPlanShape(
				patchPlan,
				this._buildPlanValidationContext(
					blockId,
					fastApplyScope.blockIds,
				),
			);
			if (!validation.valid) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					fallbackReason: "invalid-patch-plan",
					verificationFailureReason: validation.issues[0]?.message,
				});
				return null;
			}

			const execution = buildDocumentMutationPlanExecution(
				this._editor,
				patchPlan,
			);
			if (execution.issues.length > 0) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					fallbackReason: "patch-plan-execution",
					verificationFailureReason: execution.issues[0]?.message,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return null;
			}

			const verification = this._verifyFlowPatchPlanResult(
				patchPlan,
				execution.ops,
				fastApplyScope.blockIds,
			);
			if (!verification.valid) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: false,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					fallbackReason: "verification-failed",
					verificationFailureReason: verification.reason,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return null;
			}

			if (execution.ops.length === 0) {
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: true,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					confidence: patchPlan.confidence?.score,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return buildMutationReceipt({
					status: "noop",
					ops: execution.ops,
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
				this._applySuggestedAIOps(execution.ops, sessionId);
				this._recordFastApplyDebug({
					attempted: true,
					succeeded: true,
					contextChars: fastApplyScope.markdown.length,
					diffChars: text.length,
					confidence: patchPlan.confidence?.score,
					untouchedBlockMutationCount:
						verification.untouchedBlockMutationCount,
					alignment: execution.metrics?.flowPatchAlignment,
					executionPath: "native-fast-apply",
				});
				return buildMutationReceipt({
					status: "staged_suggestions",
					ops: execution.ops,
					adapterId: "flow-markdown",
					blockClass: "flow",
					transportKind: "flow-text",
				});
			}

			this._editor.apply(execution.ops, {
				origin: "ai",
				undoGroup: true,
			});
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				contextChars: fastApplyScope.markdown.length,
				diffChars: text.length,
				confidence: patchPlan.confidence?.score,
				untouchedBlockMutationCount:
					verification.untouchedBlockMutationCount,
				alignment: execution.metrics?.flowPatchAlignment,
				executionPath: "native-fast-apply",
			});
			return buildMutationReceipt({
				status: "applied",
				ops: execution.ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		const contract = parseMarkdownFastApplyContract(text);
		if (!contract) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				fallbackReason: "unparseable-contract",
			});
			return null;
		}

		const merged = applyMarkdownFastApply({
			originalMarkdown: fastApplyScope.markdown,
			contract,
		});
		if (!merged.success || !merged.mergedMarkdown) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				confidence: merged.confidence,
				fallbackReason: merged.fallbackReason ?? "merge-failed",
				verificationFailureReason: merged.issues[0],
			});
			return null;
		}

		const verification = this._verifyMarkdownFastApplyResult(
			fastApplyScope.blockIds,
			merged.mergedMarkdown,
		);
		if (!verification.valid) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: false,
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				fallbackReason: "verification-failed",
				verificationFailureReason: verification.reason,
				untouchedBlockMutationCount: 0,
			});
			return null;
		}

		const ops = this._buildMarkdownScopedReplacementOps(
			fastApplyScope.blockIds,
			merged.mergedMarkdown,
		);
		const scopedReplacementFallback = this._summarizeFastApplyFallbackOps(
			"scoped-replacement",
			ops,
			fastApplyScope.blockIds.length,
		);
		if (ops.length === 0) {
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				untouchedBlockMutationCount: 0,
				fallback: scopedReplacementFallback,
			});
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
			this._recordFastApplyDebug({
				attempted: true,
				succeeded: true,
				executionPath: "scoped-replacement",
				contextChars: fastApplyScope.markdown.length,
				diffChars: merged.diff?.length ?? 0,
				confidence: merged.confidence,
				untouchedBlockMutationCount: 0,
				fallback: scopedReplacementFallback,
			});
			return buildMutationReceipt({
				status: "staged_suggestions",
				ops,
				adapterId: "flow-markdown",
				blockClass: "flow",
				transportKind: "flow-text",
			});
		}

		this._editor.apply(ops, { origin: "ai", undoGroup: true });
		this._recordFastApplyDebug({
			attempted: true,
			succeeded: true,
			executionPath: "scoped-replacement",
			contextChars: fastApplyScope.markdown.length,
			diffChars: merged.diff?.length ?? 0,
			confidence: merged.confidence,
			untouchedBlockMutationCount: 0,
			fallback: scopedReplacementFallback,
		});
		return buildMutationReceipt({
			status: "applied",
			ops,
			adapterId: "flow-markdown",
			blockClass: "flow",
			transportKind: "flow-text",
		});
	},

_resolveMarkdownFastApplyScope(this: any, 
		blockId: string,
		workingSet: AIWorkingSetEnvelope | null,
	): { markdown: string; blockIds: string[] } | null {
		const context =
			workingSet?.context && typeof workingSet.context === "object"
				? (workingSet.context as {
						markdown?: string | null;
						retrievedSpan?: AIWorkingSetRetrievedSpan | null;
						markdownWindow?: {
							blockIds?: string[];
						} | null;
					})
				: null;
		const markdown = context?.markdown?.trim() ?? "";
		const blockIds = context?.retrievedSpan?.blockIds?.length
			? context.retrievedSpan.blockIds
			: context?.markdownWindow?.blockIds?.length
				? context.markdownWindow.blockIds
				: [blockId];
		if (markdown.length === 0 || blockIds.length === 0) {
			return null;
		}
		return {
			markdown,
			blockIds: [...new Set(blockIds)],
		};
	},

_buildPlanValidationContext(this: any, 
		blockId: string,
		scopeBlockIds: readonly string[],
	): Parameters<typeof validateDocumentMutationPlanShape>[1] {
		const knownBlockTypes = this._editor.schema
			.allBlocks()
			.filter((schema) =>
				shouldExposeBlockInTooling(
					this._editor.documentProfile,
					schema,
				),
			)
			.map((schema) => schema.type);
		const editableTargetBlockIds = scopeBlockIds.filter((targetBlockId) => {
			const block = this._editor.getBlock(targetBlockId);
			if (!block) {
				return false;
			}
			const schema = this._editor.schema.resolve(block.type);
			return shouldExposeBlockInTooling(
				this._editor.documentProfile,
				schema,
			);
		});

		return {
			documentProfile: this._editor.documentProfile,
			targetKind: this._resolvePlanValidationTargetKind(blockId),
			knownBlockTypes,
			allowedTargetBlockIds: [...scopeBlockIds],
			editableTargetBlockIds,
		};
	}
};
