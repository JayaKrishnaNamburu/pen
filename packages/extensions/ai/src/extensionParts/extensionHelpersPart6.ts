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
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function resolveRequestedOperationConflict(
	editor: Editor,
	operation: AIRequestedOperation,
	currentSelectionSignature: string | null,
): string | null {
	if (
		operation.target.kind === "selection" ||
		operation.target.kind === "scoped-range"
	) {
		const selection = resolveSelectionForRequestedOperation(
			editor,
			operation,
		);
		if (!selection) {
			return "The selected range no longer exists.";
		}
		if (isScopedSelectionTarget(operation.target)) {
			if (
				renderSelectionTargetBlockText(editor, operation.target) !==
				operation.target.sourceText
			) {
				return "The selected text changed before the rewrite completed.";
			}
			return null;
		}
		if (
			operation.provenance?.selectionSignature != null &&
			operation.provenance.selectionSignature !==
				currentSelectionSignature
		) {
			return "The selected range changed before the rewrite completed.";
		}
		if (
			resolveSelectionText(editor, selection) !==
			operation.target.sourceText
		) {
			return "The selected text changed before the rewrite completed.";
		}
		return null;
	}
	if (operation.target.kind === "block") {
		const block = editor.getBlock(operation.target.blockId);
		if (!block) {
			return "The target block no longer exists.";
		}
		if (
			operation.provenance?.blockRevision != null &&
			editor.getBlockRevision(operation.target.blockId) !==
				operation.provenance.blockRevision
		) {
			return "The target block changed before the operation completed.";
		}
		return null;
	}
	if (
		operation.provenance?.syncedGeneration != null &&
		editor.documentState.generation !==
			operation.provenance.syncedGeneration
	) {
		return "The document changed before the operation completed.";
	}
	return null;
}

export function resolveContinueInsertionOffset(
	editor: Editor,
	blockId: string,
): number {
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		selection.isCollapsed &&
		selection.anchor.blockId === blockId
	) {
		return selection.anchor.offset;
	}
	return resolveBlockInsertionOffset(editor, blockId);
}

export function createSelectionSignature(selection: TextSelection): string {
	return [
		"text",
		selection.anchor.blockId,
		selection.anchor.offset,
		selection.focus.blockId,
		selection.focus.offset,
		String(selection.isCollapsed),
	].join(":");
}

export function resolveSessionSelectionTarget(
	editor: Editor,
	session: AISession,
): TextSelection | null {
	const anchorSelection = session.contextualPrompt?.anchor.selectionSnapshot;
	if (session.target.kind !== "selection" && !anchorSelection) {
		return null;
	}
	const activeTurnSelection = session.activeTurnId
		? session.turns.find((turn) => turn.id === session.activeTurnId)
				?.selection
		: session.turns[session.turns.length - 1]?.selection;
	if (activeTurnSelection) {
		const restoredSelection = recreateTextSelection(
			editor,
			activeTurnSelection,
		);
		if (!restoredSelection.isCollapsed) {
			return restoredSelection;
		}
	}
	const selection = editor.selection;
	if (
		selection?.type === "text" &&
		!selection.isCollapsed &&
		selectionMatchesSnapshot(
			selection,
			session.target.kind === "selection"
				? resolveSessionSelectionSnapshot(session.target.selection)
				: (anchorSelection ?? null),
		)
	) {
		return selection;
	}
	if (anchorSelection) {
		const restoredSelection = recreateTextSelection(
			editor,
			anchorSelection,
		);
		if (!restoredSelection.isCollapsed) {
			return restoredSelection;
		}
	}
	if (
		session.target.kind === "selection" &&
		!session.target.selection.isCollapsed
	) {
		return session.target.selection;
	}
	return null;
}

export function resolveLiveInlineSelectionTarget(
	editor: Editor,
): Extract<AISessionTarget, { kind: "selection" }> | null {
	const selection = editor.selection;
	if (selection?.type !== "text" || selection.isCollapsed) {
		return null;
	}
	const target = resolveSessionTarget(editor, "selection");
	return target.kind === "selection" ? target : null;
}

export function resolvePendingInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const textSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			(suggestion.action === "insert" ||
				suggestion.action === "delete") &&
			suggestionIds.includes(suggestion.id),
	);
	if (textSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const previewSpanLength = textSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + previewSpanLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}

export function resolveAcceptedInlineSelectionTarget(
	editor: Editor,
	operation: AIRequestedOperation | undefined,
	suggestionIds: readonly string[],
): Extract<AISessionTarget, { kind: "selection" }> | null {
	if (
		operation?.kind !== "rewrite-selection" ||
		operation.target.kind !== "selection" ||
		operation.target.anchor.blockId !== operation.target.focus.blockId
	) {
		return null;
	}
	const insertSuggestions = readAllSuggestions(editor).filter(
		(suggestion): suggestion is PersistentTextSuggestion =>
			suggestion.kind === "text" &&
			suggestion.action === "insert" &&
			suggestionIds.includes(suggestion.id),
	);
	if (insertSuggestions.length === 0) {
		return null;
	}
	const blockId = operation.target.anchor.blockId;
	const startOffset = Math.min(
		operation.target.anchor.offset,
		operation.target.focus.offset,
	);
	const insertedLength = insertSuggestions.reduce(
		(totalLength, suggestion) => totalLength + suggestion.length,
		0,
	);
	const endOffset = startOffset + insertedLength;
	if (endOffset <= startOffset) {
		return null;
	}
	return {
		kind: "selection",
		blockId,
		selection: recreateTextSelection(editor, {
			anchor: { blockId, offset: startOffset },
			focus: { blockId, offset: endOffset },
			blockRange: [blockId],
			isMultiBlock: false,
		}),
	};
}

export function shouldCloseInlineSessionPrompt(session: AISession): boolean {
	return (
		session.surface === "inline-edit" && session.contextualPrompt != null
	);
}

export function closeInlineSessionPrompt(
	session: AISession,
): AISession["contextualPrompt"] | undefined {
	if (!shouldCloseInlineSessionPrompt(session) || !session.contextualPrompt) {
		return session.contextualPrompt;
	}

	return {
		...session.contextualPrompt,
		composer: {
			...session.contextualPrompt.composer,
			isOpen: false,
			isSubmitting: false,
		},
	};
}

export function createDefaultSessionFastApplyMetrics(): AISessionMetrics["fastApply"] {
	return {
		attemptCount: 0,
		nativeFastApplyCount: 0,
		scopedReplacementCount: 0,
		plainMarkdownCount: 0,
		failedCount: 0,
	};
}

export function accumulateSessionFastApplyMetrics(
	current: AISessionMetrics["fastApply"] | undefined,
	fastApply: FastApplyDebugState | undefined,
): AISessionMetrics["fastApply"] {
	const next = {
		...(current ?? createDefaultSessionFastApplyMetrics()),
	};
	if (!fastApply?.attempted) {
		return next;
	}
	next.attemptCount += 1;
	switch (fastApply.executionPath) {
		case "native-fast-apply":
			next.nativeFastApplyCount += 1;
			return next;
		case "scoped-replacement":
			next.scopedReplacementCount += 1;
			return next;
		case "plain-markdown":
			next.plainMarkdownCount += 1;
			return next;
		default:
			next.failedCount += 1;
			return next;
	}
}

export function selectionMatchesSnapshot(
	selection: TextSelection,
	snapshot: AISessionSelectionSnapshot | null,
): boolean {
	if (!snapshot) {
		return false;
	}

	return (
		selection.anchor.blockId === snapshot.anchor.blockId &&
		selection.anchor.offset === snapshot.anchor.offset &&
		selection.focus.blockId === snapshot.focus.blockId &&
		selection.focus.offset === snapshot.focus.offset &&
		selection.isMultiBlock === snapshot.isMultiBlock &&
		selection.blockRange.length === snapshot.blockRange.length &&
		selection.blockRange.every(
			(blockId, index) => blockId === snapshot.blockRange[index],
		)
	);
}
