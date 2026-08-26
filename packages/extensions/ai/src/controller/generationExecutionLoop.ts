import { selectionToRange } from "@input/pen-core";
import { runAgenticLoop } from "../agentic/loop";
import { compileStructuredIntentToPlan } from "../runtime/structuredIntentCompiler";
import {
	buildGenerationStructuredPreviewState,
	buildStructuredPreviewPatchOperations,
} from "../runtime/structuredPreview";
import type { GenerationState } from "../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import {
	areStructuredValuesEqual,
	createAIStreamEvent,
	EMPTY_TOOL_RUNTIME,
	resolveGenerationRequestMode,
	trimLeadingBlankBlockGenerationText,
} from "../helpers";
import { bindAIToolMutationMode } from "../tools/execution";
import type { GenerationExecutionState } from "./generationExecutionState";

export async function runGenerationLoop(
	controller: AIControllerMethodHost,
	state: GenerationExecutionState,
): Promise<GenerationState> {
	const {
		route,
		toolRuntime,
		generationPrompt,
		blockId,
		seedGeneration,
		maxSteps,
		target,
		shouldStreamDirectly,
		streamingTarget,
		selectionRange,
		canStreamSelectionSuggestions,
		canStreamBlockSuggestions,
		canStreamMarkdownBlockSuggestions,
		context,
		baselineSuggestionIds,
		shouldReplaceMarkdownTarget,
		useStructuredIntentTransport,
		adapter,
		abortController,
		workingSet,
		sessionTurnId,
	} = state;
	if (!controller._model) {
		throw new Error("No AI model configured");
	}
	const restoreToolMutationMode = bindAIToolMutationMode(
		controller._editor,
		route.mutationMode,
	);
	try {
		return await runAgenticLoop({
			model: controller._model,
			editor: controller._editor,
			feature: "generation",
			toolRuntime: route.allowToolUse ? toolRuntime : EMPTY_TOOL_RUNTIME,
			prompt: generationPrompt,
			blockId,
			generationId: seedGeneration.id,
			zoneId: seedGeneration.zoneId,
			maxSteps: route.allowToolUse
				? (maxSteps ?? controller._maxAgenticSteps)
				: 1,
			allowedMutatingTools: controller._allowedMutatingTools,
			confirm: controller._confirmAITool,
			signal: abortController.signal,
			requestMode: resolveGenerationRequestMode({
				...context,
				targetType: target.type,
			}),
			operation: context?.operation,
			sessionId: context?.sessionId,
			turnId: sessionTurnId,
			workingSet,
			validateWorkingSet: (activeWorkingSet) =>
				controller._validateWorkingSet(route, target, activeWorkingSet),
			refreshWorkingSet: async () =>
				controller._buildWorkingSet(
					toolRuntime,
					route,
					target,
					blockId,
					state.prompt,
					context?.scope,
				),
			onStatusChange: (status) => {
				controller._setState({ status });
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "status",
						status,
					}),
				);
			},
			onStep: (step) => {
				const active = controller._state.activeGeneration;
				if (!active) return;
				controller._setState({
					activeGeneration: {
						...active,
						steps: [...active.steps, step],
					},
				});
			},
			onTextDelta: (delta) => {
				const nextDelta =
					target.type === "block" &&
					state.shouldTrimLeadingBlankBlockText
						? trimLeadingBlankBlockGenerationText(delta)
						: delta;
				if (
					state.shouldTrimLeadingBlankBlockText &&
					nextDelta.length > 0
				) {
					state.shouldTrimLeadingBlankBlockText = false;
				}
				if (nextDelta.length === 0) {
					return;
				}
				state.currentText += nextDelta;
				if (target.type === "block" && shouldStreamDirectly) {
					streamingTarget?.appendDelta(nextDelta);
				} else if (canStreamSelectionSuggestions && selectionRange) {
					if (!state.streamedSuggestionInitialized) {
						controller._applySuggestedAIOps(
							[
								{
									type: "splice-text",
									blockId: selectionRange.start.blockId,
									from: selectionRange.start.offset,
									to: selectionRange.end.offset,
									insert: nextDelta,
								},
							],
							context?.sessionId,
							{ undoGroupId: seedGeneration.undoGroupId },
						);
						state.streamedSuggestionInitialized = true;
						state.streamedSuggestionLength = nextDelta.length;
					} else if (nextDelta.length > 0) {
						controller._applySuggestedAIOps(
							[
								{
									type: "splice-text",
									blockId: selectionRange.start.blockId,
									from:
										selectionRange.end.offset +
										state.streamedSuggestionLength,
									to:
										selectionRange.end.offset +
										state.streamedSuggestionLength,
									insert: nextDelta,
								},
							],
							context?.sessionId,
							{ undoGroupId: seedGeneration.undoGroupId },
						);
						state.streamedSuggestionLength += nextDelta.length;
					}
				} else if (
					canStreamBlockSuggestions &&
					target.type === "block"
				) {
					if (nextDelta.length > 0) {
						controller._applySuggestedAIOps(
							[
								{
									type: "splice-text",
									blockId: target.blockId,
									from:
										target.offset +
										state.streamedSuggestionLength,
									to:
										target.offset +
										state.streamedSuggestionLength,
									insert: nextDelta,
								},
							],
							context?.sessionId,
							{ undoGroupId: seedGeneration.undoGroupId },
						);
						state.streamedSuggestionLength += nextDelta.length;
					}
				} else if (
					canStreamMarkdownBlockSuggestions &&
					target.type === "block"
				) {
					const previewRefresh =
						controller._refreshStreamingMarkdownBlockPreview(
							target.blockId,
							state.currentText,
							route.mutationMode,
							context?.sessionId,
							baselineSuggestionIds,
							state.streamedMarkdownSuggestionIds,
							state.lastStreamedMarkdownPreviewText,
							shouldReplaceMarkdownTarget,
							context?.replaceBlockIds,
						);
					state.streamedMarkdownSuggestionIds =
						previewRefresh.suggestionIds;
					state.lastStreamedMarkdownPreviewText =
						previewRefresh.normalizedText;
				} else if (target.type === "selection") {
					controller._inlineCompletion.showSuggestion({
						id: seedGeneration.id,
						blockId: blockId,
						offset: selectionToRange(
							controller._editor.internals.doc,
							target.selection,
						).start.offset,
						text: state.currentText,
						type: "inline",
					});
				}
				const active = controller._state.activeGeneration;
				if (!active) return;
				controller._setState({
					activeGeneration: {
						...active,
						text: state.currentText,
						status: "streaming",
					},
				});
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "text-delta",
						delta: nextDelta,
						text: state.currentText,
					}),
				);
			},
			onStructuredData: (event) => {
				if (!useStructuredIntentTransport) {
					return;
				}
				const previewResult =
					adapter.parsePreview?.({
						value: event.data,
						targetKind: route.targetKind,
						activeBlockId: blockId,
					}) ?? null;
				if (!previewResult?.intent) {
					return;
				}
				state.currentStructuredIntent = previewResult.intent;
				const compilation = compileStructuredIntentToPlan(
					previewResult.intent,
					{
						activeBlockId: blockId,
					},
				);
				if (!compilation.plan) {
					return;
				}
				const nextStructuredPreview =
					buildGenerationStructuredPreviewState(controller._editor, {
						planState:
							previewResult.intentState === "validated" &&
							compilation.issues.length === 0
								? "validated"
								: "drafted",
						plan: compilation.plan,
					});
				if (
					areStructuredValuesEqual(
						state.currentStructuredPreview,
						nextStructuredPreview,
					)
				) {
					return;
				}
				const patches = buildStructuredPreviewPatchOperations(
					state.currentStructuredPreview,
					nextStructuredPreview,
				);
				state.currentStructuredPreview = nextStructuredPreview;
				controller._resolveActiveGeneration({
					structuredIntent: previewResult.intent,
					structuredPreview: nextStructuredPreview,
				});
				if (context?.sessionId && sessionTurnId) {
					controller._updateSessionTurn(
						context.sessionId,
						sessionTurnId,
						{
							reviewItemIds:
								nextStructuredPreview.reviewItems.map(
									(item) => item.id,
								),
							structuredPreview: nextStructuredPreview,
						},
					);
				}
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "app-partial",
						data: event.data,
						final: event.final,
					}),
				);
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "structured-preview",
						preview: nextStructuredPreview,
						patches,
					}),
				);
			},
			onToolCall: (event) => {
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "tool-call",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						input: event.input,
					}),
				);
			},
			onToolOutput: (event) => {
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "tool-output",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						part: event.part,
						output: event.output,
					}),
				);
			},
			onToolResult: (event) => {
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "tool-result",
						toolCallId: event.toolCallId,
						toolName: event.toolName,
						output: event.output,
						state: event.state,
					}),
				);
			},
			applyStrategy: route.applyStrategy,
			editIntent: route.intent !== "question",
			editStreaming: controller._editStreaming,
			mutationPreference: controller._mutationPreference,
			onEditPreview: (preview) => {
				const active = controller._state.activeGeneration;
				if (!active) {
					return;
				}
				const nextGeneration = {
					...active,
					editPreview: preview,
					text: preview?.text ?? active.text,
				};
				if (preview == null) {
					controller.clearStreamingReviewPreview(undefined, {
						activeGeneration: nextGeneration,
					});
					controller.dismissEphemeralSuggestion();
					return;
				}
				// A fragment that has not reached its block id yet says nothing
				// about where its text goes, and a guessed anchor covers the
				// wrong block's text with a text-range preview. Show the words
				// in the chat and wait for the payload to name its target.
				const previewBlockId = preview.blockId;
				if (previewBlockId == null) {
					controller._setState({
						activeGeneration: nextGeneration,
					});
					return;
				}
				// Posture governs where the edit *lands*, not whether you can watch
				// it arrive (EC11, EC15). Both postures show the same in-document
				// preview: it is a decoration either way, and nothing is written
				// until the call closes.
				const blockLength =
					controller._editor.getBlock(previewBlockId)?.textContent()
						.length ?? 0;
				controller.setStreamingReviewPreview(
					{
						sessionId: active.sessionId ?? active.id,
						turnId: active.turnId,
						operationIndex: preview.operationIndex,
						target: isInsertingEditOperation(preview.operation)
							? {
									kind: "insertion-point",
									blockId: previewBlockId,
									offset: blockLength,
								}
							: {
									kind: "text-range",
									blockId: previewBlockId,
									from: 0,
									to: blockLength,
								},
						text: preview.text,
					},
					{ activeGeneration: nextGeneration },
				);
			},
			onDebug: (debug) => {
				const active = controller._state.activeGeneration;
				if (!active) return;
				controller._setState({
					activeGeneration: {
						...active,
						debug,
					},
				});
			},
			onStreamingStart: (zoneId, targetBlockId) => {
				if (
					target.type !== "block" ||
					!shouldStreamDirectly ||
					state.blockStreamingStarted
				)
					return;
				streamingTarget?.beginStreaming(zoneId, targetBlockId, {
					type: "ai",
					groupId: seedGeneration.undoGroupId,
				});
				state.blockStreamingStarted = true;
			},
			onStreamingEnd: (status) => {
				if (
					target.type !== "block" ||
					!shouldStreamDirectly ||
					!state.blockStreamingStarted
				)
					return;
				streamingTarget?.endStreaming(status);
				state.blockStreamingStarted = false;
			},
		});
	} finally {
		restoreToolMutationMode();
	}
}

/**
 * Whether the streamed operation adds content rather than replacing it. An
 * insert previewed as a replacement reads as the block being overwritten and
 * then snapping back, which is worse than showing nothing.
 */
function isInsertingEditOperation(operation: string | null): boolean {
	return operation === "insert_blocks";
}
