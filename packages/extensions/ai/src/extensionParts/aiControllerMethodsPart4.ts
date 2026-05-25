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

export const aiControllerMethodsPart4 = {
cancelActiveGeneration(this: any): void {
		this._abortController?.abort();
		this._abortController = null;
		if (this._state.activeGeneration) {
			this._setState({
				status: "idle",
				activeGeneration: {
					...this._state.activeGeneration,
					status: "cancelled",
					structuredPreview: null,
				},
			});
			if (this._state.activeGeneration.sessionId) {
				if (this._state.activeGeneration.turnId) {
					this._updateSessionTurn(
						this._state.activeGeneration.sessionId,
						this._state.activeGeneration.turnId,
						{ status: "cancelled" },
					);
				}
				this._updateSession(this._state.activeGeneration.sessionId, {
					status: "cancelled",
				});
			}
		}
		this._inlineCompletion.dismissSuggestion();
	},

openCommandMenu(this: any): void {
		this._setState({ commandMenuOpen: true });
	},

closeCommandMenu(this: any): void {
		this._setState({ commandMenuOpen: false });
	},

setSuggestMode(this: any, enabled: boolean): void {
		this._setState({ suggestMode: enabled });
	},

showEphemeralSuggestion(this: any, 
		suggestion: Parameters<
			AIInlineCompletionController["showSuggestion"]
		>[0],
	): void {
		this._inlineCompletion.showSuggestion(suggestion);
	},

dismissEphemeralSuggestion(this: any): void {
		this._inlineCompletion.dismissSuggestion();
	},

acceptEphemeralSuggestion(this: any): void {
		this._inlineCompletion.acceptSuggestion();
	},

getSuggestions(this: any) {
		return this._suggestions;
	},

handleDocumentChange(this: any, 
		events: readonly {
			origin: OpOrigin;
			affectedBlocks: readonly string[];
		}[],
	): void {
		if (events.length > 0) {
			this._documentVersion += 1;
		}
		const previousState = this._state;
		const suggestionsChanged = this._syncSuggestionsFromDocument();
		const sessionsChanged = this._syncSessionsFromDocument();
		this.handleExternalCommit(events);
		if (this._state === previousState) {
			this._editor.requestDecorationUpdate();
			if (suggestionsChanged || sessionsChanged) {
				this._emit();
			}
		}
	},

_syncSuggestionResolutionState(this: any): void {
		const suggestionsChanged = this._syncSuggestionsFromDocument();
		const sessionsChanged = this._syncSessionsFromDocument();
		if (!suggestionsChanged && !sessionsChanged) {
			return;
		}
		this._editor.requestDecorationUpdate();
		this._emit();
	},

acceptSuggestion(this: any, id: string): boolean {
		const accepted = acceptSuggestion(this._editor, id);
		if (accepted) {
			this._syncSuggestionResolutionState();
		}
		return accepted;
	},

rejectSuggestion(this: any, id: string): boolean {
		const rejected = rejectSuggestion(this._editor, id);
		if (rejected) {
			this._syncSuggestionResolutionState();
		}
		return rejected;
	},

_rejectPreviewSuggestions(this: any, suggestionIds: readonly string[]): void {
		if (suggestionIds.length === 0) {
			return;
		}
		const rejected = rejectSuggestions(this._editor, suggestionIds, {
			origin: AI_SESSION_SUGGESTION_ORIGIN,
			undoGroupId: this._state.activeGeneration?.undoGroupId,
		});
		if (rejected) {
			this._syncSuggestionResolutionState();
		}
	},

acceptAllSuggestions(this: any): void {
		acceptAllSuggestions(this._editor);
		this._syncSuggestionResolutionState();
	},

rejectAllSuggestions(this: any): void {
		rejectAllSuggestions(this._editor);
		this._syncSuggestionResolutionState();
	},

buildDecorations(this: any): Decoration[] {
		const decorations = [
			...buildTrackChangesDecorations(this._editor),
			...buildAffectedRangeDecorations(
				this._editor,
				this._state.sessions,
				this._state.activeSessionId,
			),
			...buildGenerationZoneDecorations(this._state.activeGeneration),
		];
		return decorations;
	},

handleExternalCommit(this: any, 
		events: readonly {
			origin: OpOrigin;
			affectedBlocks: readonly string[];
		}[],
	): void {
		const active = this._state.activeGeneration;
		if (!active || active.status !== "streaming") return;
		if (
			active.route === "tool-loop" ||
			active.route === "context-first" ||
			active.route === "review"
		) {
			return;
		}
		const touched = events.some((event) => {
			const originType = getOpOriginType(event.origin);
			return (
				originType !== "ai" &&
				originType !== AI_SESSION_SUGGESTION_ORIGIN &&
				originType !== "system" &&
				originType !== "extension" &&
				event.affectedBlocks.includes(active.blockId)
			);
		});
		if (!touched) return;
		this.cancelActiveGeneration();
	},

async _runBlockGeneration(this: any, 
		prompt: string,
		blockId: string,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		const block = this._editor.getBlock(blockId);
		if (!block) {
			throw new Error(`Block "${blockId}" not found`);
		}

		const target: GenerationTarget = {
			type: "block",
			blockId,
			offset: resolveBlockInsertionOffset(this._editor, blockId),
		};
		return this._executeGeneration(
			prompt,
			target,
			commandId,
			maxSteps,
			context,
		);
	},

async _runDocumentGeneration(this: any, 
		prompt: string,
		preferredBlockId?: string | null,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		const documentTarget =
			context?.operation?.target.kind === "document"
				? context.operation.target
				: null;
		const replaceBlockIds =
			documentTarget?.blockIds && documentTarget.blockIds.length > 0
				? [...documentTarget.blockIds]
				: context?.replaceBlockIds;
		const insertionAnchor = resolveDocumentInsertionAnchor(this._editor, {
			preferredBlockId:
				documentTarget?.activeBlockId ??
				documentTarget?.blockIds?.[0] ??
				preferredBlockId ??
				resolveActiveBlockId(this._editor.selection) ??
				null,
		});
		if (!insertionAnchor) {
			throw new Error(
				"Cannot run an AI document prompt without an insertion anchor",
			);
		}

		return this._runBlockGeneration(
			prompt,
			insertionAnchor.blockId,
			commandId,
			maxSteps,
			{
				...context,
				replaceTargetBlock:
					documentTarget?.placement === "replace-blocks" ||
					documentTarget?.placement === "replace-empty-block" ||
					insertionAnchor.strategy === "replace-empty-block" ||
					(replaceBlockIds?.length ?? 0) > 0,
				replaceBlockIds,
			},
		);
	},

async _runSelectionGeneration(this: any, 
		prompt: string,
		selection: TextSelection,
		commandId?: string,
		maxSteps?: number,
		context?: GenerationExecutionContext,
	): Promise<GenerationState> {
		return this._executeGeneration(
			prompt,
			{ type: "selection", selection },
			commandId,
			maxSteps,
			context,
		);
	}
};
