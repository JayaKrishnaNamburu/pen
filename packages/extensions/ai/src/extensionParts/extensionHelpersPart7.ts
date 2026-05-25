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
import { buildInlineHistoryCheckpoint, countSettledInlineTurns, hasStreamingInlineTurns, resolveInlineShortcutHistoryState, areInlineShortcutHistoryStatesEqual, shouldReplaceInlineShortcutWaypointRepresentative, areEphemeralSuggestionsEqual, areStringArraysEqual, areStructuredValuesEqual } from "./extensionHelpersPart8";
import { buildSelectionReplacementOps, sliceInlineDeltasFromOffset, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, trimLeadingBlankBlockGenerationText, isVisuallyEmptyInlineText } from "./extensionHelpersPart9";

export function resolveSessionSelectionSnapshots(
	session: AISession,
): readonly AISessionSelectionSnapshot[] {
	const snapshots: AISessionSelectionSnapshot[] = [];
	const activeTurn =
		session.activeTurnId != null
			? (session.turns.find((turn) => turn.id === session.activeTurnId) ??
				null)
			: (session.turns[session.turns.length - 1] ?? null);
	if (activeTurn?.selection) {
		snapshots.push(activeTurn.selection);
	}
	if (session.contextualPrompt?.anchor.selectionSnapshot) {
		snapshots.push(session.contextualPrompt.anchor.selectionSnapshot);
	}
	if (session.target.kind === "selection") {
		snapshots.push(
			resolveSessionSelectionSnapshot(session.target.selection),
		);
	}
	return snapshots;
}

export function sessionTargetMatches(
	session: AISession,
	target: AISessionTarget,
): boolean {
	if (session.target.kind !== target.kind) {
		return false;
	}
	if (target.kind !== "selection") {
		return areStructuredValuesEqual(session.target, target);
	}
	return sessionSelectionMatches(session, target.selection);
}

export function sessionSelectionMatches(
	session: AISession,
	selection: TextSelection,
): boolean {
	return resolveSessionSelectionSnapshots(session).some((snapshot) =>
		selectionMatchesSnapshot(selection, snapshot),
	);
}

export function resolveSessionBlockId(
	editor: Editor,
	session: AISession,
): string | null {
	if (session.target.kind === "block") {
		return session.target.blockId;
	}
	if (session.target.kind === "selection") {
		return session.target.blockId;
	}
	return (
		resolveActiveBlockId(editor.selection) ??
		editor.lastBlock()?.id ??
		editor.firstBlock()?.id ??
		null
	);
}

export function resolveBlockInsertionOffset(editor: Editor, blockId: string): number {
	const selection = editor.selection;
	const block = editor.getBlock(blockId);
	const fallbackOffset =
		block && isVisuallyEmptyInlineText(block.textContent())
			? 0
			: (block?.textContent().length ?? 0);
	if (selection?.type !== "text") {
		return fallbackOffset;
	}
	const range = selection.toRange();
	if (selection.isCollapsed) {
		return selection.anchor.blockId === blockId
			? selection.anchor.offset
			: fallbackOffset;
	}
	if (range.start.blockId === blockId && range.end.blockId === blockId) {
		return range.end.offset;
	}
	if (range.end.blockId === blockId) {
		return range.end.offset;
	}
	if (range.start.blockId === blockId) {
		return range.start.offset;
	}
	return fallbackOffset;
}

export function appendUniqueString(
	values: readonly string[],
	value: string,
): string[] {
	return values.includes(value) ? [...values] : [...values, value];
}

export function areSuggestionsEqual(
	previous: readonly PersistentSuggestion[],
	next: readonly PersistentSuggestion[],
): boolean {
	if (previous.length !== next.length) {
		return false;
	}

	for (let index = 0; index < previous.length; index += 1) {
		const previousSuggestion = previous[index];
		const nextSuggestion = next[index];
		if (
			previousSuggestion.id !== nextSuggestion.id ||
			previousSuggestion.kind !== nextSuggestion.kind ||
			previousSuggestion.blockId !== nextSuggestion.blockId ||
			previousSuggestion.action !== nextSuggestion.action ||
			previousSuggestion.author !== nextSuggestion.author ||
			previousSuggestion.authorType !== nextSuggestion.authorType ||
			previousSuggestion.createdAt !== nextSuggestion.createdAt ||
			previousSuggestion.model !== nextSuggestion.model ||
			previousSuggestion.sessionId !== nextSuggestion.sessionId
		) {
			return false;
		}
		if (
			previousSuggestion.kind === "text" &&
			nextSuggestion.kind === "text" &&
			(previousSuggestion.offset !== nextSuggestion.offset ||
				previousSuggestion.length !== nextSuggestion.length)
		) {
			return false;
		}
		if (
			previousSuggestion.kind === "block" &&
			nextSuggestion.kind === "block" &&
			JSON.stringify(previousSuggestion.previousState) !==
				JSON.stringify(nextSuggestion.previousState)
		) {
			return false;
		}
	}

	return true;
}

export function areAIControllerStatesEqual(
	previous: AIControllerState,
	next: AIControllerState,
): boolean {
	if (
		previous.status !== next.status ||
		previous.activeSessionId !== next.activeSessionId ||
		previous.suggestMode !== next.suggestMode ||
		previous.commandMenuOpen !== next.commandMenuOpen ||
		previous.lastRoute !== next.lastRoute
	) {
		return false;
	}

	if (
		!areGenerationsEqual(previous.activeGeneration, next.activeGeneration)
	) {
		return false;
	}

	if (
		!areEphemeralSuggestionsEqual(
			previous.ephemeralSuggestion,
			next.ephemeralSuggestion,
		)
	) {
		return false;
	}

	return areSessionsEqual(previous.sessions, next.sessions);
}

export function areGenerationsEqual(
	previous: AIControllerState["activeGeneration"],
	next: AIControllerState["activeGeneration"],
): boolean {
	if (previous === next) {
		return true;
	}
	if (!previous || !next) {
		return previous === next;
	}

	if (
		previous.id !== next.id ||
		previous.zoneId !== next.zoneId ||
		previous.blockId !== next.blockId ||
		previous.target !== next.target ||
		previous.sessionId !== next.sessionId ||
		previous.surface !== next.surface ||
		previous.prompt !== next.prompt ||
		previous.status !== next.status ||
		previous.tokenCount !== next.tokenCount ||
		previous.undoGroupId !== next.undoGroupId ||
		previous.text !== next.text ||
		previous.commandId !== next.commandId ||
		previous.contentFormat !== next.contentFormat ||
		previous.route !== next.route ||
		previous.mutationMode !== next.mutationMode ||
		previous.planState !== next.planState ||
		previous.targetKind !== next.targetKind ||
		!areStructuredValuesEqual(
			previous.structuredPreview,
			next.structuredPreview,
		) ||
		!areStructuredValuesEqual(previous.reviewItems, next.reviewItems) ||
		!areStructuredValuesEqual(previous.plan, next.plan) ||
		!areStructuredValuesEqual(previous.debug, next.debug)
	) {
		return false;
	}

	if (!areStringArraysEqual(previous.suggestionIds, next.suggestionIds)) {
		return false;
	}

	if (previous.steps.length !== next.steps.length) {
		return false;
	}

	for (let index = 0; index < previous.steps.length; index += 1) {
		const previousStep = previous.steps[index];
		const nextStep = next.steps[index];
		if (
			previousStep.index !== nextStep.index ||
			previousStep.type !== nextStep.type ||
			previousStep.toolName !== nextStep.toolName ||
			previousStep.toolCallId !== nextStep.toolCallId ||
			previousStep.status !== nextStep.status ||
			previousStep.input !== nextStep.input ||
			previousStep.output !== nextStep.output
		) {
			return false;
		}
	}

	return true;
}

export function areSessionsEqual(
	previous: readonly AISession[],
	next: readonly AISession[],
): boolean {
	if (previous.length !== next.length) {
		return false;
	}
	for (let index = 0; index < previous.length; index += 1) {
		const previousSession = previous[index];
		const nextSession = next[index];
		if (
			!previousSession ||
			!nextSession ||
			previousSession.id !== nextSession.id ||
			previousSession.surface !== nextSession.surface ||
			previousSession.status !== nextSession.status ||
			previousSession.createdAt !== nextSession.createdAt ||
			previousSession.updatedAt !== nextSession.updatedAt ||
			previousSession.activeTurnId !== nextSession.activeTurnId ||
			!areStructuredValuesEqual(
				previousSession.target,
				nextSession.target,
			) ||
			!areStructuredValuesEqual(
				previousSession.anchor,
				nextSession.anchor,
			) ||
			!areStructuredValuesEqual(
				previousSession.contextualPrompt,
				nextSession.contextualPrompt,
			) ||
			!areStructuredValuesEqual(
				previousSession.turns,
				nextSession.turns,
			) ||
			!areStructuredValuesEqual(
				previousSession.promptHistory,
				nextSession.promptHistory,
			) ||
			!areStringArraysEqual(
				previousSession.generationIds,
				nextSession.generationIds,
			) ||
			!areStringArraysEqual(
				previousSession.pendingSuggestionIds,
				nextSession.pendingSuggestionIds,
			) ||
			!areStringArraysEqual(
				previousSession.pendingReviewItemIds,
				nextSession.pendingReviewItemIds,
			) ||
			!areStructuredValuesEqual(
				previousSession.metrics,
				nextSession.metrics,
			)
		) {
			return false;
		}
	}
	return true;
}

export function areInlineHistorySnapshotsEqual(
	previous: AIInlineHistorySnapshot,
	next: AIInlineHistorySnapshot,
): boolean {
	return (
		previous.activeSessionId === next.activeSessionId &&
		previous.documentVersion === next.documentVersion &&
		previous.kind === next.kind &&
		areSessionsEqual(previous.sessions, next.sessions)
	);
}

export function didInlineHistoryCheckpointChange(
	previousState: AIControllerState,
	nextState: AIControllerState,
): boolean {
	return !areStructuredValuesEqual(
		buildInlineHistoryCheckpoint(previousState),
		buildInlineHistoryCheckpoint(nextState),
	);
}
