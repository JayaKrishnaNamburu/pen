// @ts-nocheck
import * as deps from "./controllerDeps";
const { getDocumentToolRuntime, EMPTY_TOOL_RUNTIME, isLocalRequestedOperation, routeAIRequest, getBlockAdapter, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, supportsStructuredIntent, buildPlannerPrompt, resolveExecutionMode, createDefaultSessionFastApplyMetrics, createAIStreamEvent, resolveGenerationRequestMode, trimLeadingBlankBlockGenerationText, parseStructuredPlanPreview, buildGenerationStructuredPreviewState, areStructuredValuesEqual, buildStructuredPreviewPatchOperations, compileStructuredIntentToPlan, parseStructuredPlanResult, buildDocumentMutationPlanExecution, buildStructuralReviewItems, resolvePendingInlineSelectionTarget, resolveLiveInlineSelectionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot, appendUniqueString, runAgenticLoop } = deps;

export async function runGenerationLoop(controller: any, state: any): Promise<any> {
	const { route, toolRuntime, generationPrompt, blockId, seedGeneration, maxSteps, target, shouldStreamDirectly, streamingTarget, selectionRange, canStreamSelectionSuggestions, canStreamBlockSuggestions, canStreamMarkdownBlockSuggestions, context, baselineSuggestionIds, shouldReplaceMarkdownTarget, useStructuredIntentTransport, adapter, abortController, workingSet, sessionTurnId } = state;
			const result = await runAgenticLoop({
				model: controller._model,
				editor: controller._editor,
				toolRuntime: route.allowToolUse
					? toolRuntime
					: EMPTY_TOOL_RUNTIME,
				prompt: generationPrompt,
				blockId,
				generationId: seedGeneration.id,
				zoneId: seedGeneration.zoneId,
				maxSteps: route.allowToolUse
					? (maxSteps ?? controller._maxAgenticSteps)
					: 1,
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
						prompt,
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
					} else if (
						canStreamSelectionSuggestions &&
						selectionRange
					) {
						if (!state.streamedSuggestionInitialized) {
							controller._applySuggestedAIOps(
								[
									{
										type: "replace-text",
										blockId: selectionRange.start.blockId,
										offset: selectionRange.start.offset,
										length:
											selectionRange.end.offset -
											selectionRange.start.offset,
										text: nextDelta,
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
										type: "insert-text",
										blockId: selectionRange.start.blockId,
										offset:
											selectionRange.end.offset +
											state.streamedSuggestionLength,
										text: nextDelta,
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
										type: "insert-text",
										blockId: target.blockId,
										offset:
											target.offset +
											state.streamedSuggestionLength,
										text: nextDelta,
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
							offset: target.selection.toRange().start.offset,
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
					if (
						route.plannerMode === "structured" &&
						!useStructuredIntentTransport
					) {
						const previewResult = parseStructuredPlanPreview(
							state.currentText,
							route.targetKind,
						);
						if (previewResult?.plan) {
							const nextStructuredPreview =
								buildGenerationStructuredPreviewState(
									controller._editor,
									{
										planState:
											previewResult.planState ===
											"validated"
												? "validated"
												: "drafted",
										plan: previewResult.plan,
									},
								);
							if (
								!areStructuredValuesEqual(
									state.currentStructuredPreview,
									nextStructuredPreview,
								)
							) {
								const patches =
									buildStructuredPreviewPatchOperations(
										state.currentStructuredPreview,
										nextStructuredPreview,
									);
								state.currentStructuredPreview =
									nextStructuredPreview;
								controller._resolveActiveGeneration({
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
											structuredPreview:
												nextStructuredPreview,
										},
									);
								}
								controller._appendStreamEvent(
									createAIStreamEvent(seedGeneration, {
										type: "structured-preview",
										preview: nextStructuredPreview,
										patches,
									}),
								);
							}
						}
					}
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
					streamingTarget?.beginStreaming(zoneId, targetBlockId);
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
	return result;
}
