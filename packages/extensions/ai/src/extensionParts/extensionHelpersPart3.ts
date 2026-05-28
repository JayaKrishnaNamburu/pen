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
import { createRewriteSelectionOperation, createRewriteSelectionOperationFromResolvedTarget, createRewriteBlockOperation, createContinueBlockOperation, createDocumentTransformOperation, resolvePreviousGeneratedBlockIds, shouldReplacePreviousGeneratedBlocks, resolveReplacementDeleteBlockIds, createResolvedSelectionEditTarget, createResolvedScopedEditTarget, createResolvedEditProposal } from "./extensionHelpersPart4";
import { resolveResolvedEditProposal, resolveSelectionForRequestedOperation, resolveFullBlockTextSelection, resolveDocumentBlockRangeSelection, resolveDocumentTitleSelection, resolveDocumentParagraphSelection, parseParagraphReference, resolveWordOrdinal, resolveBlockIdForRequestedOperation } from "./extensionHelpersPart5";
import { resolveRequestedOperationConflict, resolveContinueInsertionOffset, createSelectionSignature, resolveSessionSelectionTarget, resolveLiveInlineSelectionTarget, resolvePendingInlineSelectionTarget, resolveAcceptedInlineSelectionTarget, shouldCloseInlineSessionPrompt, closeInlineSessionPrompt, createDefaultSessionFastApplyMetrics, accumulateSessionFastApplyMetrics, selectionMatchesSnapshot } from "./extensionHelpersPart6";
import { resolveSessionSelectionSnapshots, sessionTargetMatches, sessionSelectionMatches, resolveSessionBlockId, resolveBlockInsertionOffset, appendUniqueString, areSuggestionsEqual, areAIControllerStatesEqual, areGenerationsEqual, areSessionsEqual, areInlineHistorySnapshotsEqual, didInlineHistoryCheckpointChange } from "./extensionHelpersPart7";
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function resolveRequestedOperationForSession(
	editor: Editor,
	session: AISession,
	prompt: string,
	options: AICommandExecutionOptions | undefined,
	documentVersion: number,
): AIRequestedOperation {
	const explicitTarget = options?.target;
	const promptIntent = classifyPromptIntent(prompt);
	const capturedSelection = resolveSessionSelectionTarget(editor, session);
	const liveSelection =
		session.surface === "inline-edit"
			? capturedSelection
			: editor.selection?.type === "text" && !editor.selection.isCollapsed
				? editor.selection
				: capturedSelection;
	const activeBlockId =
		options?.blockId ??
		resolveSessionBlockId(editor, session) ??
		resolveActiveBlockId(editor.selection) ??
		editor.lastBlock()?.id ??
		editor.firstBlock()?.id ??
		null;
	const documentActiveBlockId =
		options?.blockId ??
		resolveActiveBlockId(editor.selection) ??
		session.anchor?.blockId ??
		null;
	const resolvedEditProposal = resolveResolvedEditProposal(
		editor,
		session,
		prompt,
		promptIntent,
		explicitTarget,
		liveSelection,
		"markdown",
	);
	const clearDocument =
		session.target.kind === "document" && isClearDocumentPrompt(prompt);
	const documentBlockIds = editor.documentState.blockOrder.filter(
		(blockId) => editor.getBlock(blockId) != null,
	);
	const documentTransformPlan = clearDocument
		? {
				blockIds: documentBlockIds,
				placement: "replace-blocks" as const,
				transform: "remove" as const,
			}
		: undefined;

	if (resolvedEditProposal) {
		return createRewriteSelectionOperationFromResolvedTarget(
			editor,
			resolvedEditProposal.target,
			resolvedEditProposal.promptIntent,
			documentVersion,
		);
	}
	if (promptIntent === "continue" && activeBlockId) {
		if (!canUseLocalBlockTextOperation(editor, activeBlockId)) {
			return createDocumentTransformOperation(
				editor,
				activeBlockId,
				promptIntent,
				documentVersion,
				{
					blockIds: [activeBlockId],
					placement: "append-after-block",
					transform: "write",
				},
			);
		}
		return createContinueBlockOperation(
			editor,
			activeBlockId,
			promptIntent,
			documentVersion,
		);
	}
	if (
		activeBlockId &&
		(promptIntent === "rewrite" ||
			(promptIntent === "local-edit" &&
				(editor.getBlock(activeBlockId)?.textContent().length ?? 0) >
					0) ||
			explicitTarget === "block")
	) {
		if (!canUseLocalBlockTextOperation(editor, activeBlockId)) {
			return createDocumentTransformOperation(
				editor,
				activeBlockId,
				promptIntent,
				documentVersion,
				{
					blockIds: [activeBlockId],
					placement: "replace-blocks",
					transform: "rewrite",
				},
			);
		}
		return createRewriteBlockOperation(
			editor,
			activeBlockId,
			promptIntent,
			documentVersion,
		);
	}
	if (explicitTarget === "document") {
		return createDocumentTransformOperation(
			editor,
			documentActiveBlockId,
			promptIntent,
			documentVersion,
			documentTransformPlan,
		);
	}
	return createDocumentTransformOperation(
		editor,
		session.target.kind === "document"
			? documentActiveBlockId
			: activeBlockId,
		promptIntent,
		documentVersion,
		documentTransformPlan,
	);
}

export function resolveLocalOperationContentFormat(
	editor: Editor,
	operation: AIRequestedOperation,
	defaultBlockFormat: AIContentFormat,
): AIContentFormat {
	if (operation.kind === "rewrite-selection") {
		return operation.target.kind === "scoped-range"
			? operation.target.contentFormat
			: "text";
	}
	if (operation.kind === "document-transform") {
		return defaultBlockFormat;
	}
	if (operation.kind !== "rewrite-block") {
		return "text";
	}
	const blockId =
		operation.target.kind === "block" ? operation.target.blockId : null;
	if (blockId && resolveFullBlockTextSelection(editor, blockId)) {
		return "text";
	}
	return defaultBlockFormat;
}

export function canUseLocalBlockTextOperation(
	editor: Editor,
	blockId: string,
): boolean {
	const block = editor.getBlock(blockId);
	if (!block) {
		return false;
	}
	const schema = editor.schema.resolve(block.type);
	if (!schema || !usesInlineTextSelection(schema)) {
		return false;
	}
	return resolveFullBlockTextSelection(editor, blockId) != null;
}

export function canReuseBottomChatSessionOperation(
	previousOperation: AIRequestedOperation,
	nextOperation: AIRequestedOperation,
): boolean {
	const previousResolvedTarget =
		resolveResolvedEditTargetFromRequestedOperation(previousOperation);
	const nextResolvedTarget =
		resolveResolvedEditTargetFromRequestedOperation(nextOperation);
	if (previousResolvedTarget && nextResolvedTarget) {
		return areResolvedEditTargetsEqual(
			previousResolvedTarget,
			nextResolvedTarget,
		);
	}
	if (previousOperation.kind !== nextOperation.kind) {
		return false;
	}
	if (previousOperation.target.kind !== nextOperation.target.kind) {
		return false;
	}
	if (
		previousOperation.target.kind === "selection" ||
		previousOperation.target.kind === "scoped-range"
	) {
		if (
			nextOperation.target.kind !== "selection" &&
			nextOperation.target.kind !== "scoped-range"
		) {
			return false;
		}
		return (
			previousOperation.provenance?.selectionSignature ===
				nextOperation.provenance?.selectionSignature &&
			previousOperation.target.sourceText ===
				nextOperation.target.sourceText
		);
	}
	if (previousOperation.target.kind === "block") {
		if (nextOperation.target.kind !== "block") {
			return false;
		}
		return (
			previousOperation.target.blockId === nextOperation.target.blockId &&
			previousOperation.provenance?.blockRevision ===
				nextOperation.provenance?.blockRevision
		);
	}
	if (nextOperation.target.kind !== "document") {
		return false;
	}
	return (
		previousOperation.target.activeBlockId ===
			nextOperation.target.activeBlockId &&
		areStructuredValuesEqual(
			previousOperation.target.blockIds ?? [],
			nextOperation.target.blockIds ?? [],
		) &&
		(previousOperation.target.placement ?? null) ===
			(nextOperation.target.placement ?? null) &&
		(previousOperation.target.transform ?? null) ===
			(nextOperation.target.transform ?? null)
	);
}

export function resolveResolvedEditTargetFromRequestedOperation(
	operation: AIRequestedOperation,
): ResolvedEditTarget | null {
	if (
		operation.target.kind !== "selection" &&
		operation.target.kind !== "scoped-range"
	) {
		return null;
	}
	return operation.target;
}

export function areResolvedEditTargetsEqual(
	previousTarget: ResolvedEditTarget,
	nextTarget: ResolvedEditTarget,
): boolean {
	if (previousTarget.kind !== nextTarget.kind) {
		return false;
	}
	if (
		previousTarget.blockId !== nextTarget.blockId ||
		previousTarget.sourceText !== nextTarget.sourceText ||
		previousTarget.anchor.blockId !== nextTarget.anchor.blockId ||
		previousTarget.anchor.offset !== nextTarget.anchor.offset ||
		previousTarget.focus.blockId !== nextTarget.focus.blockId ||
		previousTarget.focus.offset !== nextTarget.focus.offset
	) {
		return false;
	}
	if (
		previousTarget.kind === "scoped-range" &&
		nextTarget.kind === "scoped-range"
	) {
		return (
			previousTarget.scope === nextTarget.scope &&
			previousTarget.contentFormat === nextTarget.contentFormat &&
			areStructuredValuesEqual(
				previousTarget.blockIds,
				nextTarget.blockIds,
			)
		);
	}
	return true;
}

export function buildSessionExecutionPrompt(
	session: AISession | null,
	prompt: string,
): string {
	if (!session) {
		return prompt;
	}
	const previousPrompts = session.promptHistory
		.map((item) => item.prompt.trim())
		.filter((item) => item.length > 0)
		.slice(-4);
	if (previousPrompts.length === 0) {
		return prompt;
	}
	const historyLines = previousPrompts.map(
		(previousPrompt, index) => `${index + 1}. ${previousPrompt}`,
	);
	const intro =
		session.surface === "inline-edit"
			? "You are continuing an existing inline editor edit session."
			: "You are continuing an existing editor chat session.";
	const applyInstruction =
		session.surface === "inline-edit"
			? "Apply the latest request to the current selected document state."
			: "Apply the latest request to the current document state.";
	return [
		intro,
		"Earlier user requests in this same session:",
		...historyLines,
		"",
		applyInstruction,
		"Latest request:",
		prompt,
	].join("\n");
}
