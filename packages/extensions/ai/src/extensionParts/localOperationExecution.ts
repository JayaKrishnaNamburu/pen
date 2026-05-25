// @ts-nocheck
import * as deps from "./controllerDeps";
const { resolveLocalOperationContentFormat, buildSessionExecutionPrompt, resolveSessionSelectionSnapshot, resolveSessionAnchor, appendUniqueString, createAIStreamEvent, resolveGenerationRequestMode, buildMutationReceipt } = deps;
import { finalizeLocalOperationExecution } from "./localOperationExecutionFinalize";

export async function executeLocalOperation(controller: any, input: any): Promise<any> {
		const {
			prompt,
			target,
			blockId,
			commandId,
			context,
			abortController,
			baselineSuggestionIds,
			operation,
		} = input;
		const sessionTurnId = context?.sessionId
			? crypto.randomUUID()
			: undefined;
		const mutationMode: NonNullable<GenerationState["mutationMode"]> =
			"persistent-suggestions";
		const contentFormat = resolveLocalOperationContentFormat(
			controller._editor,
			operation,
			controller._resolveContentFormat("block", context?.surface),
		);
		const streamsMarkdownSelectionPreview =
			operation.kind === "rewrite-selection" &&
			operation.target.kind === "scoped-range" &&
			contentFormat === "markdown" &&
			operation.target.blockIds.length > 0;
		const applyStrategy: AIApplyStrategy | undefined =
			(operation.kind === "rewrite-block" ||
				streamsMarkdownSelectionPreview ||
				(operation.kind === "document-transform" &&
					operation.target.kind === "document" &&
					(operation.target.placement === "replace-blocks" ||
						operation.target.placement ===
							"replace-empty-block"))) &&
			contentFormat === "markdown"
				? "markdown-full-replace"
				: undefined;
		const seedGeneration: GenerationState = {
			id: crypto.randomUUID(),
			zoneId: crypto.randomUUID(),
			blockId,
			target: target.type,
			sessionId: context?.sessionId,
			turnId: sessionTurnId,
			surface: context?.surface,
			prompt,
			operation,
			status: "streaming",
			tokenCount: 0,
			steps: [],
			undoGroupId: crypto.randomUUID(),
			text: "",
			commandId,
			suggestionIds: [],
			route:
				operation.kind === "rewrite-selection"
					? "selection-rewrite"
					: operation.kind === "continue-block"
						? "cursor-context"
						: "context-first",
			mutationMode,
			contentFormat,
			applyStrategy,
			planState: "none",
			plan: null,
			structuredIntent: null,
			reviewItems: [],
			structuredPreview: null,
			targetKind: undefined,
			blockClass: "flow",
			adapterId: "flow-markdown",
			transportKind: "flow-text",
			mutationReceipt: null,
			debug: {
				messageAssemblyLatencyMs: 0,
				firstToolStartMs: null,
				firstToolResultMs: null,
				firstVisibleTextMs: null,
				toolExecutionMs: 0,
				qualitySignals: {},
			},
		};
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

		if (context?.sessionId) {
			const nextSelectionSnapshot =
				target.type === "selection"
					? resolveSessionSelectionSnapshot(target.selection)
					: undefined;
			controller._updateSession(context.sessionId, {
				status: "streaming",
				operation,
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
						operation,
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
								operation,
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
			lastRoute: seedGeneration.route,
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

		let currentText = "";
		let currentMutationReceipt: AIMutationReceipt | null = null;
		let sawStructuredFinalFrame = false;
		let streamedSelectionSuggestionIds: string[] = [];
		let lastStreamedSelectionPreviewText = "";
		const updatePreview = (text: string, phase: "preview" | "final") => {
			currentText = text;
			const nextStatus =
				phase === "preview" && text.length > 0
					? "writing"
					: controller._state.status;
			if (phase === "preview" && text.length > 0) {
				controller._setState({ status: "writing" });
				controller._appendStreamEvent(
					createAIStreamEvent(seedGeneration, {
						type: "status",
						status: "writing",
					}),
				);
			}
			controller._resolveActiveGeneration({
				text,
				status: "streaming",
				operation,
			});
			controller._appendStreamEvent(
				createAIStreamEvent(seedGeneration, {
					type: "operation",
					operation,
					phase,
					text,
				}),
			);
			void nextStatus;
		};

		try {
			const stream = controller._model!.stream({
				messages: [{ role: "user", content: executionPrompt }],
				tools: [],
				signal: abortController.signal,
				requestMode: resolveGenerationRequestMode({
					...context,
					targetType: target.type,
					operation,
				}),
				operation,
				sessionId: context?.sessionId,
				turnId: sessionTurnId,
				generationId: seedGeneration.id,
			});

			for await (const event of stream) {
				if (abortController.signal.aborted) {
					break;
				}

				if (event.type === "error") {
					throw event.error;
				}

				if (event.type === "conflict") {
					controller._appendStreamEvent(
						createAIStreamEvent(seedGeneration, {
							type: "operation",
							operation,
							phase: "conflict",
							reason: event.reason,
						}),
					);
					throw new Error(event.reason);
				}

				if (event.type === "text-delta") {
					if (
						operation.kind === "document-transform" ||
						streamsMarkdownSelectionPreview
					) {
						currentText += event.delta;
						if (
							streamsMarkdownSelectionPreview &&
							operation.target.kind === "scoped-range"
						) {
							updatePreview(currentText, "preview");
							const previewRefresh =
								controller._refreshStreamingMarkdownBlockPreview(
									operation.target.blockIds?.[0] ??
										operation.target.anchor.blockId,
									currentText,
									mutationMode,
									context?.sessionId,
									baselineSuggestionIds,
									streamedSelectionSuggestionIds,
									lastStreamedSelectionPreviewText,
									true,
									operation.target.blockIds,
								);
							streamedSelectionSuggestionIds =
								previewRefresh.suggestionIds;
							lastStreamedSelectionPreviewText =
								previewRefresh.normalizedText;
						}
						continue;
					}
					throw new Error(
						"Local AI operations must stream typed operation payloads, not raw text deltas.",
					);
				}

				if (
					event.type === "replace-preview" ||
					event.type === "insert-preview"
				) {
					updatePreview(event.text, "preview");
					if (
						streamsMarkdownSelectionPreview &&
						operation.target.kind === "scoped-range"
					) {
						const previewRefresh =
							controller._refreshStreamingMarkdownBlockPreview(
								operation.target.blockIds?.[0] ??
									operation.target.anchor.blockId,
								event.text,
								mutationMode,
								context?.sessionId,
								baselineSuggestionIds,
								streamedSelectionSuggestionIds,
								lastStreamedSelectionPreviewText,
								true,
								operation.target.blockIds,
							);
						streamedSelectionSuggestionIds =
							previewRefresh.suggestionIds;
						lastStreamedSelectionPreviewText =
							previewRefresh.normalizedText;
					}
					continue;
				}

				if (
					event.type === "replace-final" ||
					event.type === "insert-final"
				) {
					sawStructuredFinalFrame = true;
					updatePreview(event.text, "final");
					if (
						streamsMarkdownSelectionPreview &&
						operation.target.kind === "scoped-range"
					) {
						controller._rejectPreviewSuggestions(
							streamedSelectionSuggestionIds,
						);
						streamedSelectionSuggestionIds = [];
						lastStreamedSelectionPreviewText = "";
					}
					currentMutationReceipt =
						controller._commitRequestedOperationResult(
							operation,
							event.text,
							context?.sessionId,
							{
								contentFormat,
								applyStrategy,
							},
						);
					continue;
				}

				if (event.type === "done") {
					break;
				}
			}

			if (
				!sawStructuredFinalFrame &&
				currentText.length > 0 &&
				operation.kind !== "document-transform" &&
				!streamsMarkdownSelectionPreview
			) {
				throw new Error(
					"Local AI operations must return a validated final payload before they can be applied.",
				);
			}
			if (
				!sawStructuredFinalFrame &&
				currentText.length > 0 &&
				operation.kind === "document-transform"
			) {
				currentMutationReceipt = controller._commitRequestedOperationResult(
					operation,
					currentText,
					context?.sessionId,
					{
						contentFormat,
						applyStrategy,
					},
				);
			} else if (
				!sawStructuredFinalFrame &&
				currentText.length > 0 &&
				streamsMarkdownSelectionPreview
			) {
				controller._rejectPreviewSuggestions(streamedSelectionSuggestionIds);
				streamedSelectionSuggestionIds = [];
				lastStreamedSelectionPreviewText = "";
				currentMutationReceipt = controller._commitRequestedOperationResult(
					operation,
					currentText,
					context?.sessionId,
					{
						contentFormat,
						applyStrategy,
					},
				);
			}
			return finalizeLocalOperationExecution(controller, {
				context,
				sessionTurnId,
				operation,
				currentText,
				currentMutationReceipt,
				seedGeneration,
				abortController,
				baselineSuggestionIds,
			});
			controller._setState({
				status: "idle",
				activeGeneration: {
					...seedGeneration,
					text: currentText,
					status: abortController.signal.aborted
						? "cancelled"
						: "error",
				},
			});
			if (context?.sessionId) {
				if (sessionTurnId) {
					controller._updateSessionTurn(context.sessionId, sessionTurnId, {
						status: abortController.signal.aborted
							? "cancelled"
							: "error",
					});
				}
				controller._updateSession(context.sessionId, {
					status: abortController.signal.aborted
						? "cancelled"
						: "error",
				});
			}
			throw error;
		} finally {
			if (controller._abortController === abortController) {
				controller._abortController = null;
			}
		}
}
