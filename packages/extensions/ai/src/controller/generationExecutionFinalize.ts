import type { StructuralReviewItem } from "../runtime/reviewArtifacts";
import { resolveExecutionMode } from "../runtime/generationTarget";
import type { AIApplyStrategy } from "../runtime/contracts";
import type { AIMutationReceiptStatus, GenerationState } from "../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import {
	createAIStreamEvent,
	createDefaultSessionFastApplyMetrics,
	resolveLiveInlineSelectionTarget,
	resolvePendingInlineSelectionTarget,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
} from "../helpers";
import type { GenerationExecutionState } from "./generationExecutionState";

const EDIT_NOT_APPLIED_REASON =
	"The model produced output but no edit could be applied to the document.";

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
function textCanCommitMutation(applyStrategy: AIApplyStrategy): boolean {
	return applyStrategy !== "tool-edit";
}

/**
 * Whether a turn that was asked for a durable edit ended without making one.
 *
 * The markdown strategies carry their edit inside the assistant text, so a plan
 * that does not parse, or that names blocks the document does not have, leaves
 * the document untouched with nothing thrown. Reporting that as a completed
 * turn is what makes the channel look like it silently ignored the request
 * (`spec/charter/working-agreements.md`, Defect 4).
 *
 * `tool-edit` is excluded: its edits land through tool calls, which apply
 * directly and never produce a mutation receipt.
 */
function isUnappliedEdit(input: {
	applyStrategy: AIApplyStrategy;
	receiptStatus: AIMutationReceiptStatus | undefined;
	text: string;
	suggestionCount: number;
	reviewItemCount: number;
}): boolean {
	if (
		input.applyStrategy !== "markdown-full-replace"
	) {
		return false;
	}
	// Staged work is an outcome the host can act on, not a lost edit.
	if (input.suggestionCount > 0 || input.reviewItemCount > 0) {
		return false;
	}
	// An empty turn was never an edit attempt.
	if (input.text.trim().length === 0) {
		return false;
	}
	return input.receiptStatus === "noop" || input.receiptStatus === "invalid";
}

export function finalizeGenerationExecution(
	controller: AIControllerMethodHost,
	state: GenerationExecutionState,
	result: GenerationState,
): GenerationState {
	const { target, canStreamSelectionSuggestions, route, context, selectionSourceText, seedGeneration, contentFormat, shouldStreamDirectly, canStreamBlockSuggestions, canStreamMarkdownBlockSuggestions, workingSet, blockId, requestedOperation, sessionTurnId, commandId, baselineSuggestionIds, shouldReplaceMarkdownTarget } = state;
	const textCommitsMutation = textCanCommitMutation(route.applyStrategy);
			if (
				textCommitsMutation &&
				target.type === "selection" &&
				state.currentText.length > 0 &&
				!canStreamSelectionSuggestions
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
				canStreamSelectionSuggestions
			) {
				controller._recordFastApplyDebug({
					attempted: true,
					succeeded: true,
					executionPath: "native-fast-apply",
					contextChars: selectionSourceText.length,
					diffChars: state.currentText.length,
				});
			} else if (
				textCommitsMutation &&
				target.type === "block" &&
				state.currentText.length > 0 &&
				!shouldStreamDirectly &&
				!canStreamBlockSuggestions
			) {
				// Markdown block generation previews as streaming text and
				// stages here on close (RS2), so it commits on the same path
				// as an unstreamed buffered generation rather than having
				// re-staged itself on every delta.
				if (canStreamMarkdownBlockSuggestions) {
					controller.clearStreamingReviewPreview(
						context?.sessionId ?? seedGeneration.id,
					);
				}
				state.currentMutationReceipt = controller._commitBufferedBlockGeneration(
					target.blockId,
					state.currentText,
					route.mutationMode,
					contentFormat,
					context?.sessionId,
					{
						applyStrategy: route.applyStrategy,
						insertionOffset: target.offset,
						workingSet,
						replaceTargetBlock: shouldReplaceMarkdownTarget,
						replaceBlockIds: context?.replaceBlockIds,
					},
				);
				controller._inlineCompletion.dismissSuggestion();
			}

			const suggestionIds = controller.getSuggestions()
				.map((item) => item.id)
				.filter((id) => !baselineSuggestionIds.has(id));
			// the structured-intent transport was the only producer of plans
			// here, and every registered adapter is flow-text (UC3). Wave 3
			// removes the stranded plan executor and the field itself.
			const reviewItems: StructuralReviewItem[] = [];

			if (!state.currentMutationReceipt) {
				state.currentMutationReceipt = controller._buildFallbackMutationReceipt({
					committedText:
						textCommitsMutation && state.currentText.trim().length > 0,
					suggestionIds,
					reviewItems,
					planExecutionIssueCount: 0,
					adapterId: route.adapterId,
					blockClass: route.blockClass,
					transportKind: route.transportKind,
				});
			}
			const structuredDebug = {
				executionMode: resolveExecutionMode(route.mutationMode),
				targetKind: route.targetKind,
				validationIssueCount: 0,
			};
			const resolvedDebug =
				controller._state.activeGeneration?.id === seedGeneration.id
					? (controller._state.activeGeneration.debug ??
						result.debug ??
						seedGeneration.debug!)
					: (result.debug ?? seedGeneration.debug!);
			const unappliedEdit =
				result.status === "complete" &&
				isUnappliedEdit({
					applyStrategy: route.applyStrategy,
					receiptStatus: state.currentMutationReceipt?.status,
					text: state.currentText,
					suggestionCount: suggestionIds.length,
					reviewItemCount: reviewItems.length,
				});

			const finalGeneration: GenerationState = {
				...result,
				status: unappliedEdit ? "error" : result.status,
				turnReason: unappliedEdit
					? EDIT_NOT_APPLIED_REASON
					: result.turnReason,
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
				applyStrategy: route.applyStrategy,
				planState: seedGeneration.planState,
				plan: null,
				structuredIntent: state.currentStructuredIntent ?? null,
				reviewItems,
				targetKind: route.targetKind,
				blockClass: route.blockClass,
				adapterId: route.adapterId,
				transportKind: route.transportKind,
				mutationReceipt: state.currentMutationReceipt,
				debug: {
					...resolvedDebug,
					structured: structuredDebug,
				},
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
					context?.surface === "inline-edit" &&
					suggestionIds.length > 0
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
							suggestionIds.length > 0 || reviewItems.length > 0
								? "review"
								: finalGeneration.status === "complete"
									? "complete"
									: finalGeneration.status,
						suggestionIds,
						reviewItemIds: reviewItems.map((item) => item.id),
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
				controller._recordSessionFastApplyMetrics(
					context.sessionId,
					resolvedGenerationDebug?.fastApply,
				);
				controller._updateSession(context.sessionId, {
					status:
						finalGeneration.status === "complete"
							? "complete"
							: finalGeneration.status,
					pendingSuggestionIds: suggestionIds,
					pendingReviewItemIds: reviewItems.map((item) => item.id),
					metrics: {
						...(controller._state.sessions.find(
							(session) => session.id === context.sessionId,
						)?.metrics ?? {
							streamEventCount: 0,
							patchCount: 0,
							fastApply: createDefaultSessionFastApplyMetrics(),
						}),
						firstTokenMs:
							resolvedGenerationDebug?.firstVisibleTextMs ??
							undefined,
						totalMs:
							resolvedGenerationDebug?.messageAssemblyLatencyMs !=
							null
								? resolvedGenerationDebug.messageAssemblyLatencyMs +
									(resolvedGenerationDebug.toolExecutionMs ??
										0)
								: undefined,
						toolMs:
							resolvedGenerationDebug?.toolExecutionMs ??
							undefined,
						streamEventCount: controller._streamEvents.filter(
							(event) => event.sessionId === context.sessionId,
						).length,
						patchCount: 0,
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
	controller: AIControllerMethodHost,
	state: GenerationExecutionState,
	error: unknown,
): GenerationState {
	const { seedGeneration, blockId, context, sessionTurnId, commandId, target, abortController, route, streamingTarget, prompt } = state;
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
						reviewItemIds: [],
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
