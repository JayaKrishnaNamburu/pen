import type { GenerationState } from "../types";
import type { AIControllerImpl } from "./aiController";
import {
	createAIStreamEvent,
	createDefaultSessionCommitMetrics,
	resolveLiveInlineSelectionTarget,
	resolvePendingInlineSelectionTarget,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
} from "../helpers";
import type { GenerationExecutionState } from "./generationExecutionState";
import {
	calledEditTool,
	editToolAccountedForEdit,
	EDIT_NOT_APPLIED_REASON,
	isUnappliedEdit,
} from "./unappliedEdit";

/**
 * Whether the assistant text stream may become a durable document mutation.
 *
 * On the tool channel it may not: the edit arrives as an `edit_document` call,
 * and text is the model talking (`spec/packages/extensions/ai.md` EC1). The
 * commit paths below cannot infer this themselves — `_commitBufferedBlockGeneration`
 * reads markdown it was handed and builds insert ops, so a model that answers
 * with prose instead of calling the tool gets that prose appended to the
 * document as a second copy. EC6 names this the worst failure mode available to
 * a document editor: "could not understand the edit" must never become "write
 * this text into the document".
 */
function textCanCommitMutation(editsArriveAsToolCalls: boolean): boolean {
	return !editsArriveAsToolCalls;
}

export function finalizeGenerationExecution(
	controller: AIControllerImpl,
	state: GenerationExecutionState,
	result: GenerationState,
): GenerationState {
	const {
		target,
		streamingSink,
		route,
		context,
		selectionSourceText,
		seedGeneration,
		contentFormat,
		workingSet,
		blockId,
		requestedOperation,
		sessionTurnId,
		commandId,
		baselineSuggestionIds,
		shouldReplaceMarkdownTarget,
	} = state;
	const textCommitsMutation = textCanCommitMutation(
		route.editsArriveAsToolCalls,
	);
	if (
		textCommitsMutation &&
		target.type === "selection" &&
		state.currentText.length > 0 &&
		streamingSink.kind !== "suggestion-splice"
	) {
		controller.clearStreamingReviewPreview(
			context?.sessionId ?? seedGeneration.id,
		);
		state.currentMutationReceipt = controller._commitSelectionRewrite(
			target.selection,
			state.currentText,
			route.mutationMode,
			context?.sessionId,
		);
	} else if (
		target.type === "selection" &&
		state.currentText.length > 0 &&
		streamingSink.kind === "suggestion-splice"
	) {
		controller._recordCommitDebug({
			attempted: true,
			succeeded: true,
			executionPath: "selection-replacement",
			contextChars: selectionSourceText.length,
			diffChars: state.currentText.length,
		});
	} else if (
		textCommitsMutation &&
		target.type === "block" &&
		state.currentText.length > 0 &&
		streamingSink.kind !== "direct-write" &&
		streamingSink.kind !== "suggestion-splice"
	) {
		if (streamingSink.kind === "review-preview") {
			controller.clearStreamingReviewPreview(
				context?.sessionId ?? seedGeneration.id,
			);
		}
		state.currentMutationReceipt =
			controller._commitBufferedBlockGeneration(
				target.blockId,
				state.currentText,
				route.mutationMode,
				contentFormat,
				context?.sessionId,
				{
					insertionOffset: target.offset,
					workingSet,
					replaceTargetBlock: shouldReplaceMarkdownTarget,
					replaceBlockIds: context?.replaceBlockIds,
				},
			);
		controller._inlineCompletion.dismissSuggestion();
	}

	const suggestionIds = controller
		.getSuggestions()
		.map((item) => item.id)
		.filter((id) => !baselineSuggestionIds.has(id));
	if (!state.currentMutationReceipt) {
		state.currentMutationReceipt = controller._buildFallbackMutationReceipt(
			{
				committedText:
					textCommitsMutation && state.currentText.trim().length > 0,
				suggestionIds,
				adapterId: route.adapterId,
				blockClass: route.blockClass,
				transportKind: route.transportKind,
			},
		);
	}
	const resolvedDebug =
		controller._state.activeGeneration?.id === seedGeneration.id
			? (controller._state.activeGeneration.debug ??
				result.debug ??
				seedGeneration.debug!)
			: (result.debug ?? seedGeneration.debug!);
	const unappliedEdit =
		result.status === "complete" &&
		isUnappliedEdit({
			editAttempted: calledEditTool(result.steps),
			editAccountedFor: editToolAccountedForEdit(result.steps),
			receiptStatus: state.currentMutationReceipt?.status,
			suggestionCount: suggestionIds.length,
		});

	const finalGeneration: GenerationState = {
		...result,
		status: unappliedEdit ? "error" : result.status,
		turnReason: unappliedEdit ? EDIT_NOT_APPLIED_REASON : result.turnReason,
		blockId,
		target: target.type,
		sessionId: context?.sessionId,
		turnId: sessionTurnId,
		surface: context?.surface,
		commandId,
		text: state.currentText,
		suggestionIds,
		route: route.lane,
		mutationMode: route.mutationMode,
		contentFormat,
		editsArriveAsToolCalls: route.editsArriveAsToolCalls,
		targetKind: route.targetKind,
		blockClass: route.blockClass,
		adapterId: route.adapterId,
		transportKind: route.transportKind,
		mutationReceipt: state.currentMutationReceipt,
		debug: resolvedDebug,
	};
	controller._abortController = null;
	controller._appendStreamEvent(
		createAIStreamEvent(seedGeneration, {
			type: "generation-finish",
			status: finalGeneration.status,
			text: state.currentText,
		}),
	);
	controller._setState({
		status: "idle",
		activeGeneration: finalGeneration,
	});
	if (context?.sessionId) {
		const refreshedInlineReviewSelectionTarget =
			context?.surface === "inline-edit" && suggestionIds.length > 0
				? (resolvePendingInlineSelectionTarget(
						controller._editor,
						requestedOperation ?? undefined,
						suggestionIds,
					) ?? resolveLiveInlineSelectionTarget(controller._editor))
				: null;
		if (sessionTurnId) {
			const receiptEvidence = state.currentMutationReceipt?.evidence;
			const generatedBlockIds = receiptEvidence
				? [
						...new Set([
							...receiptEvidence.affectedBlockIds,
							...receiptEvidence.createdBlockIds,
						]),
					]
				: [];
			controller._updateSessionTurn(context.sessionId, sessionTurnId, {
				status:
					suggestionIds.length > 0
						? "review"
						: finalGeneration.status === "complete"
							? "complete"
							: finalGeneration.status,
				suggestionIds,
				generatedBlockIds,
				anchor: refreshedInlineReviewSelectionTarget
					? resolveSessionAnchor(
							controller._editor,
							refreshedInlineReviewSelectionTarget.selection,
						)
					: undefined,
				selection: refreshedInlineReviewSelectionTarget
					? resolveSessionSelectionSnapshot(
							controller._editor,
							refreshedInlineReviewSelectionTarget.selection,
						)
					: undefined,
			});
		}
		const resolvedGenerationDebug =
			controller._state.activeGeneration?.id === finalGeneration.id
				? controller._state.activeGeneration.debug
				: finalGeneration.debug;
		controller._recordSessionCommitMetrics(
			context.sessionId,
			resolvedGenerationDebug?.commit,
		);
		controller._updateSession(context.sessionId, {
			status:
				finalGeneration.status === "complete"
					? "complete"
					: finalGeneration.status,
			pendingSuggestionIds: suggestionIds,
			metrics: {
				...(controller._state.sessions.find(
					(session) => session.id === context.sessionId,
				)?.metrics ?? {
					streamEventCount: 0,
					patchCount: 0,
					commit: createDefaultSessionCommitMetrics(),
				}),
				firstTokenMs:
					resolvedGenerationDebug?.firstVisibleTextMs ?? undefined,
				totalMs:
					resolvedGenerationDebug?.messageAssemblyLatencyMs != null
						? resolvedGenerationDebug.messageAssemblyLatencyMs +
							(resolvedGenerationDebug.toolExecutionMs ?? 0)
						: undefined,
				toolMs: resolvedGenerationDebug?.toolExecutionMs ?? undefined,
				streamEventCount: controller._streamEvents.filter(
					(event) => event.sessionId === context.sessionId,
				).length,
			},
		});
	}

	if (finalGeneration.status === "complete") {
		controller._editor.internals.emit("diagnostic", {
			level: "info",
			source: "ai",
			code: "GENERATION_COMPLETE",
			message: "AI generation completed",
			blockId,
			generationId: finalGeneration.id,
		});
	} else if (unappliedEdit) {
		controller._editor.internals.emit("diagnostic", {
			level: "warn",
			source: "ai",
			code: "GENERATION_EDIT_NOT_APPLIED",
			message: EDIT_NOT_APPLIED_REASON,
			blockId,
			generationId: finalGeneration.id,
		});
	}

	return finalGeneration;
}

export function handleGenerationExecutionError(
	controller: AIControllerImpl,
	state: GenerationExecutionState,
	error: unknown,
): GenerationState {
	const {
		seedGeneration,
		blockId,
		context,
		sessionTurnId,
		commandId,
		target,
		abortController,
		route,
		streamingTarget,
		prompt,
	} = state;
	const isStaleWorkingSet =
		error instanceof Error && error.name === "StaleWorkingSetError";
	const failedGeneration: GenerationState = {
		...(controller._state.activeGeneration ?? seedGeneration),
		blockId,
		sessionId: context?.sessionId,
		turnId: sessionTurnId,
		surface: context?.surface,
		prompt,
		commandId,
		text: state.currentText,
		status:
			abortController.signal.aborted || isStaleWorkingSet
				? "cancelled"
				: "error",
		targetKind: route.targetKind,
	};
	controller._abortController = null;
	controller._inlineCompletion.dismissSuggestion();
	if (target.type === "block" && state.blockStreamingStarted) {
		streamingTarget?.endStreaming(
			abortController.signal.aborted ? "cancelled" : "error",
		);
		state.blockStreamingStarted = false;
	}
	controller._appendStreamEvent(
		createAIStreamEvent(seedGeneration, {
			type: "generation-finish",
			status: failedGeneration.status,
			text: state.currentText,
		}),
	);
	controller._setState({
		status: "idle",
		activeGeneration: failedGeneration,
	});
	if (context?.sessionId) {
		if (sessionTurnId) {
			controller._updateSessionTurn(context.sessionId, sessionTurnId, {
				status: failedGeneration.status,
			});
		}
		controller._updateSession(context.sessionId, {
			status: failedGeneration.status,
		});
	}
	if (abortController.signal.aborted || isStaleWorkingSet) {
		return failedGeneration;
	}
	throw error;
}
