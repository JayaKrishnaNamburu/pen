// @ts-nocheck
import * as deps from "./controllerDeps";
const { getDocumentToolRuntime, EMPTY_TOOL_RUNTIME, isLocalRequestedOperation, buildSessionExecutionPrompt, routeAIRequest, getBlockAdapter, resolveSelectionText, shouldReplaceEmptyMarkdownTarget, shouldTrimLeadingBlankBlockGenerationText, supportsStructuredIntent, buildPlannerPrompt, resolveExecutionMode, createDefaultSessionFastApplyMetrics, createAIStreamEvent, resolveGenerationRequestMode, trimLeadingBlankBlockGenerationText, parseStructuredPlanPreview, buildGenerationStructuredPreviewState, areStructuredValuesEqual, buildStructuredPreviewPatchOperations, compileStructuredIntentToPlan, parseStructuredPlanResult, buildDocumentMutationPlanExecution, buildStructuralReviewItems, resolvePendingInlineSelectionTarget, resolveLiveInlineSelectionTarget, resolveSessionAnchor, resolveSessionSelectionSnapshot, appendUniqueString } = deps;

import { runGenerationLoop } from "./generationExecutionLoop";
import { finalizeGenerationExecution, handleGenerationExecutionError } from "./generationExecutionFinalize";

export async function executeGeneration(controller: any, input: any): Promise<any> {
	const { prompt, target, commandId, maxSteps, context } = input;
		if (!controller._model) {
			throw new Error("No AI model configured");
		}

		controller.cancelActiveGeneration();
		const toolRuntime =
			getDocumentToolRuntime(controller._editor) ?? EMPTY_TOOL_RUNTIME;
		const abortController = new AbortController();
		controller._abortController = abortController;

		const baselineSuggestionIds = new Set(
			controller.getSuggestions().map((item) => item.id),
		);
		const blockId =
			target.type === "block"
				? target.blockId
				: target.selection.toRange().start.blockId;
		const requestedOperation = context?.operation ?? null;
		if (
			context?.surface === "bottom-chat" &&
			isLocalRequestedOperation(requestedOperation)
		) {
			return controller._executeLocalOperation({
				prompt,
				target,
				blockId,
				commandId,
				context,
				abortController,
				baselineSuggestionIds,
				operation: requestedOperation,
			});
		}
		const requestedContentFormat = controller._resolveContentFormat(
			target.type,
			context?.surface,
		);
		let route = routeAIRequest({
			prompt,
			selection: controller._editor.selection,
			blockType: controller._editor.getBlock(blockId)?.type ?? null,
			blockCount: controller._editor.blockCount(),
			suggestMode: controller._state.suggestMode,
			target: target.type,
			contentFormat: requestedContentFormat,
			surface: context?.surface,
		});
		let workingSet = await controller._buildWorkingSet(
			toolRuntime,
			route,
			target,
			blockId,
			prompt,
		);
		const refinedRoute = controller._refineRouteWithWorkingSet(route, workingSet);
		if (refinedRoute.lane !== route.lane) {
			route = refinedRoute;
			workingSet = await controller._buildWorkingSet(
				toolRuntime,
				route,
				target,
				blockId,
				prompt,
			);
		} else {
			route = refinedRoute;
		}
		const adapter = getBlockAdapter(route.adapterId);
		const contentFormat = route.contentFormat;
		let currentText = "";
		const streamingTarget =
			controller._editor.internals.getSlot<StreamingTarget>(
				"delta-stream:target",
			) ?? null;
		let blockStreamingStarted = false;
		const shouldStreamDirectly = route.shouldStreamDirectly;
		const selectionRange =
			target.type === "selection" ? target.selection.toRange() : null;
		const selectionSourceText =
			target.type === "selection"
				? resolveSelectionText(controller._editor, target.selection)
				: "";
		const shouldStreamSuggestedText =
			route.mutationMode === "streaming-suggestions" &&
			route.plannerMode !== "structured" &&
			contentFormat === "text";
		const shouldReplaceMarkdownTarget =
			context?.replaceTargetBlock === true ||
			(route.plannerMode !== "structured" &&
				contentFormat === "markdown" &&
				target.type === "block" &&
				(route.targetKind === "table" ||
					(context?.surface === "bottom-chat" &&
						shouldReplaceEmptyMarkdownTarget(
							controller._editor.getBlock(blockId),
						))));
		const canStreamSelectionSuggestions =
			shouldStreamSuggestedText &&
			target.type === "selection" &&
			selectionRange?.start.blockId === selectionRange?.end.blockId;
		const canStreamBlockSuggestions =
			shouldStreamSuggestedText && target.type === "block";
		const canStreamMarkdownBlockSuggestions =
			route.mutationMode === "streaming-suggestions" &&
			route.plannerMode !== "structured" &&
			contentFormat === "markdown" &&
			target.type === "block" &&
			route.applyStrategy === "markdown-full-replace" &&
			context?.surface === "bottom-chat";
		let streamedSuggestionInitialized = false;
		let streamedSuggestionLength = 0;
		let streamedMarkdownSuggestionIds: string[] = [];
		let lastStreamedMarkdownPreviewText = "";
		const sessionTurnId = context?.sessionId
			? crypto.randomUUID()
			: undefined;
		const existingSession =
			context?.sessionId != null
				? (controller._state.sessions.find(
						(session) => session.id === context.sessionId,
					) ?? null)
				: null;
		const executionPrompt = buildSessionExecutionPrompt(
			existingSession,
			prompt,
		);
		let shouldTrimLeadingBlankBlockText =
			target.type === "block" &&
			shouldTrimLeadingBlankBlockGenerationText(
				controller._editor.getBlock(blockId),
			);
		const useStructuredIntentTransport =
			adapter.transportKind !== "flow-text" &&
			supportsStructuredIntent(controller._model);
		const generationPrompt =
			useStructuredIntentTransport ||
			(adapter.id === "flow-markdown" && contentFormat === "markdown")
				? adapter.buildPrompt({
						prompt: executionPrompt,
						targetKind: route.targetKind,
						activeBlockId: blockId,
						workingSet,
						applyStrategy: route.applyStrategy,
					})
				: route.plannerMode === "structured"
					? buildPlannerPrompt({
							prompt: executionPrompt,
							targetKind: route.targetKind,
							workingSet,
						})
					: executionPrompt;

		const seedGeneration: GenerationState = {
			id: crypto.randomUUID(),
			zoneId: crypto.randomUUID(),
			blockId,
			target: target.type,
			sessionId: context?.sessionId,
			turnId: sessionTurnId,
			surface: context?.surface,
			prompt,
			operation: requestedOperation,
			status: "streaming",
			tokenCount: 0,
			steps: [],
			undoGroupId: crypto.randomUUID(),
			text: "",
			commandId,
			suggestionIds: [],
			route: route.lane,
			mutationMode: route.mutationMode,
			contentFormat,
			applyStrategy: route.applyStrategy,
			planState: "none",
			plan: null,
			structuredIntent: null,
			reviewItems: [],
			structuredPreview: null,
			targetKind: route.targetKind,
			blockClass: route.blockClass,
			adapterId: route.adapterId,
			transportKind: route.transportKind,
			mutationReceipt: null,
			debug: {
				messageAssemblyLatencyMs: 0,
				firstToolStartMs: null,
				firstToolResultMs: null,
				firstVisibleTextMs: null,
				toolExecutionMs: 0,
				qualitySignals: {},
				routeConfidence: workingSet?.routeConfidence,
				structured: {
					plannerMode: route.plannerMode,
					executionMode: resolveExecutionMode(route.mutationMode),
					targetKind: route.targetKind,
					validationIssueCount: 0,
				},
				fastApply: {
					attempted: false,
					succeeded: false,
				},
			},
		};
		if (context?.sessionId) {
			const nextSelectionSnapshot =
				target.type === "selection"
					? resolveSessionSelectionSnapshot(target.selection)
					: undefined;
			controller._updateSession(context.sessionId, {
				status: "streaming",
				operation: requestedOperation,
				activeTurnId: sessionTurnId,
				anchor:
					target.type === "selection"
						? resolveSessionAnchor(target.selection)
						: resolveSessionAnchor(controller._editor.selection),
				generationIds: appendUniqueString(
					existingSession?.generationIds ?? [],
					seedGeneration.id,
				),
				promptHistory: [
					...(existingSession?.promptHistory ?? []),
					{
						id: crypto.randomUUID(),
						prompt,
						createdAt: Date.now(),
						generationId: seedGeneration.id,
						operation: requestedOperation ?? undefined,
					},
				],
				turns: sessionTurnId
					? [
							...(existingSession?.turns ?? []),
							{
								id: sessionTurnId,
								prompt,
								createdAt: Date.now(),
								undoGroupId: seedGeneration.undoGroupId,
								generationId: seedGeneration.id,
								target: target.type,
								operation: requestedOperation ?? undefined,
								status: "streaming",
								suggestionIds: [],
								reviewItemIds: [],
								generatedBlockIds: [],
								structuredPreview: null,
								anchor:
									target.type === "selection"
										? resolveSessionAnchor(target.selection)
										: undefined,
								selection:
									target.type === "selection"
										? resolveSessionSelectionSnapshot(
												target.selection,
											)
										: undefined,
							},
						]
					: existingSession?.turns,
				contextualPrompt: existingSession?.contextualPrompt
					? {
							...existingSession.contextualPrompt,
							anchor:
								target.type === "selection"
									? {
											...existingSession.contextualPrompt
												.anchor,
											selectionSnapshot:
												nextSelectionSnapshot,
											focusBlockId:
												target.selection.toRange().start
													.blockId,
											status: "valid",
										}
									: existingSession.contextualPrompt.anchor,
							composer: {
								...existingSession.contextualPrompt.composer,
								draftPrompt: "",
								isSubmitting: true,
								isOpen: true,
								openReason: "user",
							},
						}
					: undefined,
			});
		}
		controller._setState({
			status: "thinking",
			activeGeneration: seedGeneration,
			commandMenuOpen: false,
			lastRoute: route.lane,
			activeSessionId: context?.sessionId ?? controller._state.activeSessionId,
		});
		let currentStructuredPreview: GenerationStructuredPreviewState | null =
			null;
		let currentStructuredIntent: GenerationState["structuredIntent"] = null;
		let currentMutationReceipt: AIMutationReceipt | null = null;
		controller._setStreamEvents([
			createAIStreamEvent(seedGeneration, {
				type: "generation-start",
				prompt,
				target: target.type,
			}),
			createAIStreamEvent(seedGeneration, {
				type: "status",
				status: "thinking",
			}),
		]);
	const state = {
		prompt,
		target,
		commandId,
		maxSteps,
		context,
		toolRuntime,
		abortController,
		baselineSuggestionIds,
		blockId,
		requestedOperation,
		route,
		workingSet,
		adapter,
		contentFormat,
		currentText,
		streamingTarget,
		blockStreamingStarted,
		shouldStreamDirectly,
		selectionRange,
		selectionSourceText,
		shouldReplaceMarkdownTarget,
		canStreamSelectionSuggestions,
		canStreamBlockSuggestions,
		canStreamMarkdownBlockSuggestions,
		streamedSuggestionInitialized,
		streamedSuggestionLength,
		streamedMarkdownSuggestionIds,
		lastStreamedMarkdownPreviewText,
		sessionTurnId,
		existingSession,
		executionPrompt,
		shouldTrimLeadingBlankBlockText,
		useStructuredIntentTransport,
		generationPrompt,
		seedGeneration,
		currentStructuredPreview,
		currentStructuredIntent,
		currentMutationReceipt,
	};
	try {
		const result = await runGenerationLoop(controller, state);
		return finalizeGenerationExecution(controller, state, result);
	} catch (error) {
		return handleGenerationExecutionError(controller, state, error);
	}
}
