import type {
	Editor,
	ModelAdapter,
	ModelMessage,
	ModelMessagePart,
	ModelRequestedOperation,
} from "@pen/types";
import {
	type PlaygroundExecutionLane,
	streamPlaygroundAIResponse,
} from "./playgroundAISession";
import { logAutocompleteDebug } from "./autocompleteDebug";

export function createPlaygroundAIModel(
	getEditor: () => Editor | null,
): ModelAdapter {
	return {
		capabilities: {
			structuredIntent: true,
		},
		async *stream(options) {
			try {
				const editor = getEditor();

				if (!editor) {
					logAutocompleteDebug("model stream aborted: editor unavailable");
					yield {
						type: "error",
						error: new Error("The playground editor is not ready yet."),
					} as const;
					return;
				}

				const prompt = getLatestPrompt(options.messages);
				const lane = resolvePlaygroundExecutionLane(options.requestMode);
				const inlineLegacySelectionRequest =
					lane === "inline-edit" && options.operation == null
						? resolveInlineLegacySelectionRequest(editor, prompt)
						: null;
				const requestPrompt =
					inlineLegacySelectionRequest?.userPrompt.trim() || prompt;
				let lastInlinePreviewText = "";
				logAutocompleteDebug("model stream started", {
					promptPreview: prompt.slice(0, 160),
					promptLength: prompt.length,
					lane,
					isolatedSession: lane !== "bottom-chat",
					hasSyntheticOperation: inlineLegacySelectionRequest != null,
				});
				for await (const chunk of streamPlaygroundAIResponse(
					editor,
					requestPrompt,
					options.signal,
					{
						lane,
						operation:
							options.operation ?? inlineLegacySelectionRequest?.operation,
						requestMode: options.requestMode,
					},
				)) {
					logAutocompleteDebug("model stream chunk", {
						type: chunk.type ?? "unknown",
						deltaLength:
							typeof chunk.delta === "string" ? chunk.delta.length : null,
						error:
							typeof chunk.error === "string"
								? chunk.error
								: chunk.error instanceof Error
									? chunk.error.message
									: null,
					});

					if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
						yield {
							type: "text-delta",
							delta: chunk.delta,
						} as const;
						continue;
					}

					if (
						(chunk.type === "replace-preview" ||
							chunk.type === "replace-final" ||
							chunk.type === "insert-preview" ||
							chunk.type === "insert-final") &&
						chunk.operation &&
						typeof chunk.text === "string"
					) {
						if (inlineLegacySelectionRequest) {
							const delta = chunk.text.startsWith(lastInlinePreviewText)
								? chunk.text.slice(lastInlinePreviewText.length)
								: chunk.text;
							lastInlinePreviewText = chunk.text;
							if (delta.length > 0) {
								yield {
									type: "text-delta",
									delta,
								} as const;
							}
							continue;
						}
						yield {
							type: chunk.type,
							operation: chunk.operation as ModelRequestedOperation,
							text: chunk.text,
						} as const;
						continue;
					}

					if (chunk.type === "conflict" && typeof chunk.reason === "string") {
						if (inlineLegacySelectionRequest) {
							yield {
								type: "error",
								error: new Error(chunk.reason),
							} as const;
							return;
						}
						yield {
							type: "conflict",
							reason: chunk.reason,
							operation: chunk.operation as ModelRequestedOperation | undefined,
						} as const;
						continue;
					}

					if (
						(chunk.type === "app-partial" ||
							chunk.type === "app-final") &&
						chunk.data !== undefined
					) {
						yield {
							type: "structured-data",
							contract: "app",
							data: chunk.data,
							final: chunk.type === "app-final",
						} as const;
						continue;
					}

					if (chunk.type === "done") {
						logAutocompleteDebug("model stream done");
						yield { type: "done" as const };
						return;
					}

					if (chunk.type === "error") {
						logAutocompleteDebug("model stream error chunk", {
							error:
								typeof chunk.error === "string"
									? chunk.error
									: chunk.error instanceof Error
										? chunk.error.message
										: chunk.error,
						});
						yield {
							type: "error",
							error:
								typeof chunk.error === "string"
									? new Error(chunk.error)
									: chunk.error,
						} as const;
						return;
					}
				}

				logAutocompleteDebug("model stream ended without terminal chunk");
				yield { type: "done" as const };
			} catch (error) {
				if (options.signal?.aborted) {
					logAutocompleteDebug("model stream aborted by signal");
					return;
				}

				logAutocompleteDebug("model stream threw", {
					error: error instanceof Error ? error.message : String(error),
				});
				yield {
					type: "error",
					error,
				} as const;
			}
		},
	};
}

function getLatestPrompt(messages: ModelMessage[]): string {
	const lastMessage = messages[messages.length - 1];
	if (!lastMessage) {
		return "";
	}
	return flattenMessageContent(lastMessage.content).trim();
}

function flattenMessageContent(content: string | ModelMessagePart[]): string {
	if (typeof content === "string") {
		return content;
	}

	const textParts = content.flatMap((part) => {
		if (part.type === "text") {
			return [part.text];
		}
		if (part.type === "tool-result") {
			return [String(part.result ?? "")];
		}
		return [];
	});

	return textParts.join("\n");
}

function resolvePlaygroundExecutionLane(
	requestMode?: string,
): PlaygroundExecutionLane {
	if (requestMode === "inline-autocomplete") {
		return "autocomplete";
	}
	if (requestMode === "inline-edit") {
		return "inline-edit";
	}
	return "bottom-chat";
}

function resolveInlineLegacySelectionRequest(
	editor: Editor,
	prompt: string,
): { operation: ModelRequestedOperation; userPrompt: string } | null {
	const normalizedPrompt = prompt.replace(/\r\n?/g, "\n");
	const contextMarker = "Document context:\n";
	const requestMarker = "\n\nUser request:\n";
	const contextStart = normalizedPrompt.indexOf(contextMarker);
	const requestStart = normalizedPrompt.lastIndexOf(requestMarker);
	if (contextStart < 0 || requestStart <= contextStart + contextMarker.length) {
		return null;
	}
	const contextJson = normalizedPrompt
		.slice(contextStart + contextMarker.length, requestStart)
		.trim();
	const userPrompt = normalizedPrompt.slice(requestStart + requestMarker.length).trim();
	if (!contextJson || !userPrompt) {
		return null;
	}

	try {
		const context = JSON.parse(contextJson) as {
			selection?: {
				type?: string;
				anchor?: { blockId?: string; offset?: number };
				focus?: { blockId?: string; offset?: number };
				isCollapsed?: boolean;
			} | null;
			selectedText?: string;
		};
		const selection = context.selection;
		const anchor = selection?.anchor;
		const focus = selection?.focus;
		let fallbackSelectedText = "";
		if (
			typeof anchor?.blockId === "string" &&
			typeof anchor.offset === "number" &&
			typeof focus?.blockId === "string" &&
			typeof focus.offset === "number"
		) {
			fallbackSelectedText = resolveSelectionSourceText(editor, {
				blockId: anchor.blockId,
				anchorOffset: anchor.offset,
				focusBlockId: focus.blockId,
				focusOffset: focus.offset,
			});
		}
		const selectedText = context.selectedText?.trim().length
			? context.selectedText
			: fallbackSelectedText;
		if (
			selection?.type !== "text" ||
			selection.isCollapsed !== false ||
			typeof selection.anchor?.blockId !== "string" ||
			typeof selection.anchor?.offset !== "number" ||
			typeof selection.focus?.blockId !== "string" ||
			typeof selection.focus?.offset !== "number" ||
			selectedText.trim().length === 0
		) {
			return null;
		}

		return {
			userPrompt,
			operation: {
				kind: "rewrite-selection",
				applyPolicy: "selection-replace",
				promptIntent: "rewrite",
				target: {
					kind: "selection",
					blockId: selection.anchor.blockId,
					anchor: {
						blockId: selection.anchor.blockId,
						offset: selection.anchor.offset,
					},
					focus: {
						blockId: selection.focus.blockId,
						offset: selection.focus.offset,
					},
					sourceText: selectedText,
				},
			},
		};
	} catch {
		return null;
	}
}

function resolveSelectionSourceText(
	editor: Editor,
	input: {
		blockId: string;
		anchorOffset: number;
		focusBlockId: string;
		focusOffset: number;
	},
): string {
	if (input.blockId !== input.focusBlockId) {
		return editor.getSelectedText();
	}
	const block = editor.getBlock(input.blockId);
	if (!block) {
		return "";
	}
	const start = Math.min(input.anchorOffset, input.focusOffset);
	const end = Math.max(input.anchorOffset, input.focusOffset);
	return block.textContent({ resolved: true }).slice(start, end);
}
