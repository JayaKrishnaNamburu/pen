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
import { resolveGenerationRequestMode, isLocalRequestedOperation, EMPTY_TOOL_RUNTIME, MAX_STREAM_EVENTS, AI_UNDO_HISTORY_METADATA_KEY, resolveOrderedReviewItems, sortReviewItemsForRemoval, compareReviewItemRemovalOrder, resolveActiveBlockId, readModelId, supportsStructuredIntent, createAIStreamEvent, resolvePromptTarget, resolveSessionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot } from "./extensionHelpersPart1";
import type { GenerationTarget, GenerationExecutionContext, AIInlineHistoryRestoreRequest, AIInlineShortcutHistoryPhase, AIInlineShortcutHistoryState, AIInlineShortcutHistoryWaypoint, AIStreamEventInput } from "./extensionHelpersPart1";
import { resolveContextualPromptAnchor, resolveContextualPromptState, createInlineHistorySnapshot, cloneSessionTarget, cloneInlineHistorySessions, recreateTextSelection, resolveSelectionSnapshotBlockRange, resolveSelectionSnapshotRangeStart, resolveSelectionSnapshotRangeEnd } from "./extensionHelpersPart2";
import { resolveRequestedOperationForSession, resolveLocalOperationContentFormat, canUseLocalBlockTextOperation, canReuseBottomChatSessionOperation, resolveResolvedEditTargetFromRequestedOperation, areResolvedEditTargetsEqual, buildSessionExecutionPrompt } from "./extensionHelpersPart3";
import { createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal } from "./extensionHelpersPart4";
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";

export function buildSelectionReplacementOps(
	editor: Editor,
	selection: TextSelection,
	insertedText: string,
): DocumentOp[] {
	const range = selection.toRange();
	if (range.start.blockId === range.end.blockId) {
		return [
			{
				type: "replace-text",
				blockId: range.start.blockId,
				offset: range.start.offset,
				length: range.end.offset - range.start.offset,
				text: insertedText,
			},
		];
	}
	const startId = range.start.blockId;
	const endId = range.end.blockId;
	const startText = editor.getBlock(startId)?.textContent() ?? "";
	const middleIds = range.blockRange.slice(1, -1);
	const suffixDeltas = sliceInlineDeltasFromOffset(
		editor.getBlock(endId)?.textDeltas() ?? [],
		range.end.offset,
	);
	const ops: DocumentOp[] = [];

	if (range.start.offset < startText.length) {
		ops.push({
			type: "delete-text",
			blockId: startId,
			offset: range.start.offset,
			length: startText.length - range.start.offset,
		});
	}

	if (range.end.offset > 0) {
		ops.push({
			type: "delete-text",
			blockId: endId,
			offset: 0,
			length: range.end.offset,
		});
	}

	for (const blockId of middleIds) {
		ops.push({
			type: "delete-block",
			blockId,
		});
	}

	let insertionOffset = range.start.offset;
	if (insertedText.length > 0) {
		ops.push({
			type: "insert-text",
			blockId: startId,
			offset: insertionOffset,
			text: insertedText,
		});
		insertionOffset += insertedText.length;
	}

	for (const delta of suffixDeltas) {
		ops.push({
			type: "insert-text",
			blockId: startId,
			offset: insertionOffset,
			text: delta.insert,
			marks: delta.attributes,
		});
		insertionOffset += delta.insert.length;
	}

	ops.push({
		type: "delete-block",
		blockId: endId,
	});
	return ops;
}

export function sliceInlineDeltasFromOffset(
	deltas: readonly { insert: string; attributes?: Record<string, unknown> }[],
	startOffset: number,
): Array<{ insert: string; attributes?: Record<string, unknown> }> {
	const sliced: Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}> = [];
	let offset = 0;
	for (const delta of deltas) {
		const length = delta.insert.length;
		if (startOffset >= offset + length) {
			offset += length;
			continue;
		}
		const localStart = Math.max(0, startOffset - offset);
		const text = delta.insert.slice(localStart);
		if (text.length > 0) {
			sliced.push(
				delta.attributes
					? { insert: text, attributes: delta.attributes }
					: { insert: text },
			);
		}
		offset += length;
	}
	return sliced;
}

export function resolveSelectionText(
	editor: Editor,
	selection: TextSelection,
): string {
	const range = selection.toRange();
	const blockIds = range.blockRange;
	const parts = blockIds.map((blockId, index) => {
		const block = editor.getBlock(blockId);
		if (!block) return "";

		let rawOffset = 0;
		let resolved = "";
		const startOffset = index === 0 ? range.start.offset : 0;
		const endOffset =
			index === blockIds.length - 1
				? range.end.offset
				: Number.POSITIVE_INFINITY;

		for (const delta of block.textDeltas()) {
			const length = delta.insert.length;
			const rawStart = rawOffset;
			const rawEnd = rawOffset + length;
			rawOffset = rawEnd;

			if (endOffset <= rawStart || startOffset >= rawEnd) {
				continue;
			}

			const sliceStart = Math.max(0, startOffset - rawStart);
			const sliceEnd = Math.min(length, endOffset - rawStart);
			if (sliceEnd <= sliceStart) {
				continue;
			}

			const suggestion = delta.attributes?.suggestion as
				| { action?: string }
				| undefined;
			if (suggestion?.action === "delete") {
				continue;
			}

			resolved += delta.insert.slice(sliceStart, sliceEnd);
		}

		return resolved;
	});

	return parts.join("\n");
}

export function shouldReplaceEmptyMarkdownTarget(
	block: ReturnType<Editor["getBlock"]>,
): boolean {
	if (!block) {
		return false;
	}

	return (
		block.type === "paragraph" &&
		isVisuallyEmptyInlineText(block.textContent({ resolved: true }))
	);
}

export function shouldTrimLeadingBlankBlockGenerationText(
	block: ReturnType<Editor["getBlock"]>,
): boolean {
	if (!block) {
		return false;
	}
	return isVisuallyEmptyInlineText(block.textContent({ resolved: true }));
}

export function trimLeadingBlankBlockGenerationText(text: string): string {
	return text.replace(/^(?:[ \t]*\r?\n)+/, "");
}

export function isVisuallyEmptyInlineText(text: string): boolean {
	return text.replace(/\u200B/g, "").trim().length === 0;
}
