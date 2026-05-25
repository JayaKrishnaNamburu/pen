// @ts-nocheck
import * as deps from "./controllerDeps";
const { getDocumentToolRuntime, EMPTY_TOOL_RUNTIME, isLocalRequestedOperation, routeAIRequest, getBlockAdapter, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, supportsStructuredIntent, buildPlannerPrompt, resolveExecutionMode, createDefaultSessionFastApplyMetrics, createAIStreamEvent, resolveGenerationRequestMode, trimLeadingBlankBlockGenerationText, parseStructuredPlanPreview, buildGenerationStructuredPreviewState, areStructuredValuesEqual, buildStructuredPreviewPatchOperations, compileStructuredIntentToPlan, parseStructuredPlanResult, buildDocumentMutationPlanExecution, buildStructuralReviewItems, resolvePendingInlineSelectionTarget, resolveLiveInlineSelectionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot, appendUniqueString } = deps;

export function finalizeGenerationExecution(controller: any, state: any, result: any): any {
	const { target, canStreamSelectionSuggestions, route, context, selectionSourceText, seedGeneration, contentFormat, shouldStreamDirectly, canStreamBlockSuggestions, canStreamMarkdownBlockSuggestions, workingSet, useStructuredIntentTransport, adapter, blockId, requestedOperation, sessionTurnId, commandId, baselineSuggestionIds, shouldReplaceMarkdownTarget } = state;
			if (
				target.type === "selection" &&
				state.currentText.length > 0 &&
				!canStreamSelectionSuggestions
			) {
				state.currentMutationReceipt = controller._commitSelectionRewrite(
					target.selection,
					state.currentText,
					route.mutationMode,
					context?.sessionId,
				);
				controller._inlineCompletion.dismissSuggestion();
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
				target.type === "block" &&
				state.currentText.length > 0 &&
				!shouldStreamDirectly &&
				!canStreamBlockSuggestions &&
				!canStreamMarkdownBlockSuggestions &&
				route.plannerMode !== "structured"
			) {
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
			const structuredPlanResult =
				route.plannerMode === "structured" &&
				!useStructuredIntentTransport
					? parseStructuredPlanResult(state.currentText, route.targetKind)
					: null;
			const structuredIntentResolution = useStructuredIntentTransport
				? (adapter.resolveResult?.({
						value: state.currentStructuredIntent,
						targetKind: route.targetKind,
						activeBlockId: blockId,
					}) ?? null)
				: null;
			const structuredIntentResult =
				structuredIntentResolution?.parseResult ?? null;
			const structuredIntentCompilation =
				structuredIntentResolution?.compilation ?? null;
			const resolvedStructuredPlan =
				structuredIntentCompilation?.plan ??
				structuredPlanResult?.plan ??
				null;
			const planExecution = resolvedStructuredPlan
				? buildDocumentMutationPlanExecution(
						controller._editor,
						resolvedStructuredPlan,
					)
				: null;
			const reviewItems =
				resolvedStructuredPlan &&
				route.mutationMode !== "direct-stream" &&
				(!planExecution || !planExecution.reviewSafe)
					? buildStructuralReviewItems(
							controller._editor,
							resolvedStructuredPlan,
						)
					: [];

			if (
				resolvedStructuredPlan &&
				planExecution &&
				planExecution.issues.length === 0
			) {
				state.currentMutationReceipt = controller._commitStructuredPlan(
					planExecution.ops,
					planExecution.reviewSafe,
					route.mutationMode,
					route.adapterId,
					route.blockClass,
					route.transportKind,
				);
			}
			if (!state.currentMutationReceipt) {
				state.currentMutationReceipt = controller._buildFallbackMutationReceipt({
					currentText: state.currentText,
					suggestionIds,
					reviewItems,
					planExecutionIssueCount: planExecution?.issues.length ?? 0,
					adapterId: route.adapterId,
					blockClass: route.blockClass,
					transportKind: route.transportKind,
				});
			}
			const structuredDebug = {
				plannerMode: route.plannerMode,
				executionMode: resolveExecutionMode(route.mutationMode),
				targetKind: route.targetKind,
				validationIssueCount:
					(structuredPlanResult?.issues.length ?? 0) +
					(structuredIntentResult?.issues.length ?? 0) +
					(structuredIntentCompilation?.issues.length ?? 0) +
					(planExecution?.issues.length ?? 0),
			};
			const resolvedDebug =
				controller._state.activeGeneration?.id === seedGeneration.id
					? (controller._state.activeGeneration.debug ??
						result.debug ??
						seedGeneration.debug!)
					: (result.debug ?? seedGeneration.debug!);
			const resolvedPlanState: GenerationState["planState"] =
				planExecution && planExecution.issues.length > 0
					? "rejected"
					: structuredIntentResult?.intentState === "validated" &&
						  (structuredIntentCompilation?.issues.length ?? 0) ===
								0
						? "validated"
						: structuredIntentResult?.intentState === "drafted"
							? "drafted"
							: (structuredPlanResult?.planState ??
								seedGeneration.planState);

			const finalGeneration: GenerationState = {
				...result,
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
				planState: resolvedPlanState,
				plan: resolvedStructuredPlan,
				structuredIntent:
					structuredIntentResult?.intent ??
					state.currentStructuredIntent ??
					null,
				reviewItems,
				structuredPreview: resolvedStructuredPlan
					? buildGenerationStructuredPreviewState(controller._editor, {
							planState:
								planExecution &&
								planExecution.issues.length === 0
									? "validated"
									: "drafted",
							plan: resolvedStructuredPlan,
						})
					: state.currentStructuredPreview,
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
				const structuredPreviewEvents = controller.getStreamEvents().filter(
					(event) =>
						event.type === "structured-preview" &&
						event.sessionId === context.sessionId,
				);
				const lastStructuredPreviewEvent =
					structuredPreviewEvents[structuredPreviewEvents.length - 1];
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
						structuredPreview:
							finalGeneration.structuredPreview ?? null,
						anchor: refreshedInlineReviewSelectionTarget
							? resolveSessionAnchor(
									refreshedInlineReviewSelectionTarget.selection,
								)
							: undefined,
						selection: refreshedInlineReviewSelectionTarget
							? resolveSessionSelectionSnapshot(
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
						patchCount:
							lastStructuredPreviewEvent?.type ===
							"structured-preview"
								? lastStructuredPreviewEvent.patches.length
								: 0,
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
			}

			return finalGeneration;
}

export function handleGenerationExecutionError(controller: any, state: any, error: unknown): any {
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
						structuredPreview: null,
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
