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

export const aiControllerMethodsPart2 = {
canReuseSessionPrompt(this: any, 
		sessionId: string,
		prompt: string,
		options?: AICommandExecutionOptions,
	): boolean {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return false;
		}
		if (session.surface !== "bottom-chat" || !session.operation) {
			return true;
		}
		const nextOperation =
			options?.operation ??
			resolveRequestedOperationForSession(
				this._editor,
				session,
				prompt,
				options,
				this._documentVersion,
			);
		return canReuseBottomChatSessionOperation(
			session.operation,
			nextOperation,
		);
	},

resolveSession(this: any, 
		sessionId: string,
		resolution: AISessionResolution,
	): boolean {
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		if (!session) {
			return false;
		}
		let resolved = false;
		for (const turn of session.turns) {
			resolved =
				this._resolveSessionTurn(sessionId, turn.id, resolution, {
					finalizeSession: false,
				}) || resolved;
		}
		if (resolved) {
			const nextSession =
				this._state.sessions.find((item) => item.id === sessionId) ??
				session;
			this._updateSession(sessionId, {
				status: "complete",
				pendingSuggestionIds: [],
				pendingReviewItemIds: [],
				contextualPrompt: closeInlineSessionPrompt(nextSession),
			});
		}
		return resolved;
	},

acceptSession(this: any, sessionId: string): boolean {
		return this.resolveSession(sessionId, "accept");
	},

rejectSession(this: any, sessionId: string): boolean {
		return this.resolveSession(sessionId, "reject");
	},

cancelSession(this: any, sessionId: string): void {
		if (this._state.activeGeneration?.sessionId === sessionId) {
			this.cancelActiveGeneration();
		}
		const session = this._state.sessions.find(
			(item) => item.id === sessionId,
		);
		this._updateSession(sessionId, {
			status: "cancelled",
			contextualPrompt: session?.contextualPrompt
				? {
						...session.contextualPrompt,
						composer: {
							...session.contextualPrompt.composer,
							isOpen: false,
							isSubmitting: false,
						},
					}
				: undefined,
		});
	},

suspendInlineSession(this: any, sessionId: string): void {
		this._setInlineSessionComposerOpen(sessionId, false);
	},

resumeInlineSession(this: any, sessionId: string): void {
		this._setInlineSessionComposerOpen(sessionId, true, {
			openReason: "user",
		});
	},

canUndoInlineHistory(this: any): boolean {
		return this._inlineHistoryIndex > 0;
	},

canRedoInlineHistory(this: any): boolean {
		return (
			this._inlineHistoryIndex >= 0 &&
			this._inlineHistoryIndex < this._inlineHistory.length - 1
		);
	},

undoInlineHistory(this: any): boolean {
		return this._navigateInlineHistory("undo");
	},

redoInlineHistory(this: any): boolean {
		return this._navigateInlineHistory("redo");
	},

canHandleInlineHistoryShortcut(this: any, 
		direction: AIInlineHistoryDirection,
	): boolean {
		if (this._pendingInlineHistoryRestore) {
			return true;
		}
		return this._canHandleInlineHistoryShortcut(direction, {
			shortcutOnly: true,
		});
	},

handleInlineHistoryShortcut(this: any, direction: AIInlineHistoryDirection): boolean {
		if (this._pendingInlineHistoryRestore) {
			this._queuedInlineHistoryShortcutDirections.push(direction);
			return true;
		}
		return this._navigateInlineHistory(direction, { shortcutOnly: true });
	},

async runCommand(this: any, 
		commandId: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		const ctx = this.getCommandContext();
		const command = this._registry.resolve(commandId);
		if (!command) {
			throw new Error(`Unknown AI command "${commandId}"`);
		}
		if (command.guard && !command.guard(ctx)) {
			throw new Error(
				`AI command "${command.label}" is not available in this context`,
			);
		}

		const prompt = this._registry.resolvePrompt(command, ctx);
		this._lastPrompt = prompt;
		this._lastCommandId = command.id;

		if (
			command.target === "selection" &&
			ctx.selection?.type === "text" &&
			!ctx.selection.isCollapsed
		) {
			return this._runSelectionGeneration(
				prompt,
				ctx.selection,
				command.id,
				options?.maxSteps,
			);
		}

		const targetBlockId =
			options?.blockId ??
			ctx.blockId ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!targetBlockId) {
			throw new Error("Cannot run AI command without a target block");
		}
		return this._runBlockGeneration(
			prompt,
			targetBlockId,
			command.id,
			options?.maxSteps,
		);
	},

async runPrompt(this: any, 
		prompt: string,
		options?: AICommandExecutionOptions,
	): Promise<GenerationState> {
		this._lastPrompt = prompt;
		this._lastCommandId = null;
		const promptTarget = resolvePromptTarget(
			this._editor.selection,
			options?.target,
		);
		if (promptTarget === "selection") {
			const selection = this._editor.selection;
			if (selection?.type !== "text" || selection.isCollapsed) {
				throw new Error(
					"Cannot run a selection prompt without selected text",
				);
			}
			return this._runSelectionGeneration(
				prompt,
				selection,
				undefined,
				options?.maxSteps,
			);
		}
		if (promptTarget === "document") {
			return this._runDocumentGeneration(
				prompt,
				options?.blockId,
				undefined,
				options?.maxSteps,
			);
		}
		const blockId =
			options?.blockId ??
			resolveActiveBlockId(this._editor.selection) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) {
			throw new Error("Cannot run AI prompt without a target block");
		}
		return this._runBlockGeneration(
			prompt,
			blockId,
			undefined,
			options?.maxSteps,
		);
	},

async retryActiveGeneration(this: any): Promise<GenerationState | null> {
		const prompt = this._lastPrompt;
		if (!prompt) return null;
		this.rejectActiveGeneration();
		const active = this._state.activeGeneration;
		const blockId =
			active?.blockId ??
			resolveActiveBlockId(this._editor.selection) ??
			this._editor.lastBlock()?.id ??
			this._editor.firstBlock()?.id;
		if (!blockId) return null;
		if (active?.sessionId) {
			const activeSession = this._state.sessions.find(
				(session) => session.id === active.sessionId,
			);
			const retryTarget =
				activeSession?.target.kind === "document"
					? "document"
					: (active?.target ?? "block");
			return this.runSessionPrompt(active.sessionId, prompt, {
				blockId: retryTarget === "document" ? null : blockId,
				target: retryTarget,
			});
		}
		if (this._lastCommandId) {
			return this.runCommand(this._lastCommandId, { blockId });
		}
		return this.runPrompt(prompt, {
			blockId,
			target: active?.target ?? "block",
		});
	}
};
