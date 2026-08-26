import { selectionToRange, streamingTargetFacet } from "@input/pen-core";
import { getDocumentToolRuntime } from "@input/pen-document-ops";
import { generateId, type StreamingTarget } from "@input/pen-types";
import { getBlockAdapter } from "../runtime/blockAdapters";
import { routeAIRequest } from "../runtime/router";
import { buildPlannerPrompt, resolveExecutionMode } from "../runtime/structuredPlanner";
import type { GenerationState } from "../types";
import type { AIControllerMethodHost } from "./aiControllerMethodHost";
import {
	appendUniqueString,
	buildSessionExecutionPrompt,
	createAIStreamEvent,
	EMPTY_TOOL_RUNTIME,
	isLocalRequestedOperation,
	resolveSelectionText,
	resolveSessionAnchor,
	resolveSessionSelectionSnapshot,
	shouldReplaceEmptyMarkdownTarget,
	shouldTrimLeadingBlankBlockGenerationText,
	supportsStructuredIntent,
} from "../helpers";
import { finalizeGenerationExecution, handleGenerationExecutionError } from "./generationExecutionFinalize";
import { runGenerationLoop } from "./generationExecutionLoop";
import type {
	ExecuteGenerationInput,
	GenerationExecutionState,
} from "./generationExecutionState";

export async function executeGeneration(
	controller: AIControllerMethodHost,
	input: ExecuteGenerationInput,
): Promise<GenerationState> {
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
				: selectionToRange(
						controller._editor.internals.doc,
						target.selection,
					).start.blockId;
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
		mutationPreference: controller._mutationPreference,
	});
		let workingSet = await controller._buildWorkingSet(
			toolRuntime,
			route,
			target,
			blockId,
			prompt,
			context?.scope,
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
				context?.scope,
			);
		} else {
			route = refinedRoute;
		}
		const adapter = getBlockAdapter(route.adapterId);
		const contentFormat = route.contentFormat;
		const streamingTarget =
			(controller._editor.facet(streamingTargetFacet) as StreamingTarget | null) ??
			null;
		const shouldStreamDirectly = route.shouldStreamDirectly;
		const selectionRange =
			target.type === "selection"
				? selectionToRange(
						controller._editor.internals.doc,
						target.selection,
					)
				: null;
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
		const sessionTurnId = context?.sessionId
			? generateId()
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
			id: generateId(),
			zoneId: generateId(),
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
			undoGroupId: generateId(),
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
					? resolveSessionSelectionSnapshot(
							controller._editor,
							target.selection,
						)
					: undefined;
			controller._updateSession(context.sessionId, {
				status: "streaming",
				operation: requestedOperation,
				activeTurnId: sessionTurnId,
				anchor:
					target.type === "selection"
						? resolveSessionAnchor(
								controller._editor,
								target.selection,
							)
						: resolveSessionAnchor(
								controller._editor,
								controller._editor.selection,
							),
				generationIds: appendUniqueString(
					existingSession?.generationIds ?? [],
					seedGeneration.id,
				),
				promptHistory: [
					...(existingSession?.promptHistory ?? []),
					{
						id: generateId(),
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
										? resolveSessionAnchor(
												controller._editor,
												target.selection,
											)
										: undefined,
								selection:
									target.type === "selection"
										? resolveSessionSelectionSnapshot(
												controller._editor,
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
											focusBlockId: selectionToRange(
												controller._editor.internals
													.doc,
												target.selection,
											).start.blockId,
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
	const state: GenerationExecutionState = {
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
		currentText: "",
		streamingTarget,
		blockStreamingStarted: false,
		shouldStreamDirectly,
		selectionRange,
		selectionSourceText,
		shouldReplaceMarkdownTarget,
		canStreamSelectionSuggestions,
		canStreamBlockSuggestions,
		canStreamMarkdownBlockSuggestions,
		streamedSuggestionInitialized: false,
		streamedSuggestionLength: 0,
		streamedMarkdownSuggestionIds: [],
		lastStreamedMarkdownPreviewText: "",
		sessionTurnId,
		existingSession,
		executionPrompt,
		shouldTrimLeadingBlankBlockText:
			target.type === "block" &&
			shouldTrimLeadingBlankBlockGenerationText(
				controller._editor.getBlock(blockId),
			),
		useStructuredIntentTransport,
		generationPrompt,
		seedGeneration,
		currentStructuredPreview: null,
		currentStructuredIntent: null,
		currentMutationReceipt: null,
	};
	try {
		const result = await runGenerationLoop(controller, state);
		return finalizeGenerationExecution(controller, state, result);
	} catch (error) {
		return handleGenerationExecutionError(controller, state, error);
	}
}
