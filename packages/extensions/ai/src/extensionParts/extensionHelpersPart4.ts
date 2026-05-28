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
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function createRewriteSelectionOperation(
	editor: Editor,
	selection: TextSelection,
	promptIntent: string,
	documentVersion: number,
	options?: {
		sourceText?: string;
	},
): AIRequestedOperation {
	const range = selection.toRange();
	return {
		kind: "rewrite-selection",
		applyPolicy: "selection-replace",
		promptIntent,
		target: {
			kind: "selection",
			blockId: range.start.blockId,
			anchor: { ...selection.anchor },
			focus: { ...selection.focus },
			sourceText:
				options?.sourceText ?? resolveSelectionText(editor, selection),
		},
		provenance: {
			documentVersion,
			blockRevision: editor.getBlockRevision(range.start.blockId),
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createRewriteSelectionOperationFromResolvedTarget(
	editor: Editor,
	target: ResolvedEditTarget,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const selection = recreateTextSelection(editor, {
		anchor: target.anchor,
		focus: target.focus,
		blockRange: resolveSelectionTargetBlockIds(editor, target),
		isMultiBlock:
			resolveSelectionTargetBlockIds(editor, target).length > 1 ||
			target.anchor.blockId !== target.focus.blockId,
	});
	if (target.kind === "selection") {
		return createRewriteSelectionOperation(
			editor,
			selection,
			promptIntent,
			documentVersion,
			{
				sourceText: target.sourceText,
			},
		);
	}
	return {
		kind: "rewrite-selection",
		applyPolicy: "selection-replace",
		promptIntent,
		target: {
			kind: "scoped-range",
			blockId: target.blockId,
			anchor: { ...target.anchor },
			focus: { ...target.focus },
			sourceText: target.sourceText,
			blockIds: [...target.blockIds],
			contentFormat: target.contentFormat,
			scope: target.scope,
		},
		provenance: {
			documentVersion,
			blockRevision: editor.getBlockRevision(
				target.blockId ?? selection.anchor.blockId,
			),
			selectionSignature: createSelectionSignature(selection),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createRewriteBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "rewrite-block",
		applyPolicy: "block-replace",
		promptIntent,
		target: {
			kind: "block",
			blockId,
			blockType: block?.type ?? null,
			sourceText: block?.textContent() ?? "",
		},
		provenance: {
			documentVersion,
			blockRevision: editor.getBlockRevision(blockId),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createContinueBlockOperation(
	editor: Editor,
	blockId: string,
	promptIntent: string,
	documentVersion: number,
): AIRequestedOperation {
	const block = editor.getBlock(blockId);
	return {
		kind: "continue-block",
		applyPolicy: "block-continue",
		promptIntent,
		target: {
			kind: "block",
			blockId,
			blockType: block?.type ?? null,
			sourceText: block?.textContent() ?? "",
			insertionOffset: resolveContinueInsertionOffset(editor, blockId),
		},
		provenance: {
			documentVersion,
			blockRevision: editor.getBlockRevision(blockId),
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function createDocumentTransformOperation(
	editor: Editor,
	activeBlockId: string | null,
	promptIntent: string,
	documentVersion: number,
	options?: {
		blockIds?: readonly string[];
		placement?:
			| "append-after-block"
			| "replace-empty-block"
			| "replace-blocks";
		transform?: "write" | "rewrite" | "remove";
	},
): AIRequestedOperation {
	return {
		kind: "document-transform",
		applyPolicy: "document-review",
		promptIntent,
		target: {
			kind: "document",
			activeBlockId,
			blockIds: options?.blockIds,
			placement: options?.placement,
			transform: options?.transform,
		},
		provenance: {
			documentVersion,
			syncedGeneration: editor.documentState.generation,
		},
	};
}

export function resolvePreviousGeneratedBlockIds(session: AISession): string[] {
	const completedTurns = session.turns.filter(
		(turn) => turn.status === "complete" || turn.status === "accepted",
	);
	const lastTurnWithBlocks = completedTurns
		.slice()
		.reverse()
		.find((turn) => turn.generatedBlockIds.length > 0);
	return lastTurnWithBlocks?.generatedBlockIds ?? [];
}

export function shouldReplacePreviousGeneratedBlocks(
	session: AISession,
	prompt: string,
): boolean {
	return (
		session.surface === "bottom-chat" &&
		session.target.kind === "document" &&
		(classifyPromptIntent(prompt) === "rewrite" ||
			isDocumentResetPrompt(prompt) ||
			isDocumentFollowUpEditPrompt(prompt))
	);
}

export function resolveReplacementDeleteBlockIds(
	editor: Editor,
	blockId: string,
	replaceBlockIds?: readonly string[],
): string[] {
	const requestedIds =
		replaceBlockIds && replaceBlockIds.length > 0
			? replaceBlockIds
			: [blockId];
	const deleteBlockIds = requestedIds.filter(
		(candidateBlockId, index, allBlockIds) =>
			allBlockIds.indexOf(candidateBlockId) === index &&
			editor.getBlock(candidateBlockId) != null,
	);
	return deleteBlockIds.length > 0 ? deleteBlockIds : [blockId];
}

export function createResolvedSelectionEditTarget(
	editor: Editor,
	selection: TextSelection,
): ResolvedEditTarget {
	const range = selection.toRange();
	return {
		kind: "selection",
		blockId: range.start.blockId,
		anchor: { ...selection.anchor },
		focus: { ...selection.focus },
		sourceText: resolveSelectionText(editor, selection),
	};
}

export function createResolvedScopedEditTarget(
	editor: Editor,
	selection: TextSelection,
	scope: ModelOperationScopedRangeTarget["scope"],
	contentFormat: AIContentFormat,
): ResolvedEditTarget {
	const range = selection.toRange();
	return {
		kind: "scoped-range",
		scope,
		blockId: range.start.blockId,
		anchor: { ...selection.anchor },
		focus: { ...selection.focus },
		blockIds: [...range.blockRange],
		sourceText: resolveSelectionText(editor, selection),
		contentFormat,
	};
}

export function createResolvedEditProposal(
	promptIntent: string,
	target: ResolvedEditTarget,
): ResolvedEditProposal {
	return {
		promptIntent,
		target,
	};
}
