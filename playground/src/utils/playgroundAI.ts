import type {
	Editor,
	ModelAdapter,
	ModelMessage,
	ModelMessagePart,
} from "@pen/core";
import {
	streamPlaygroundAIResponse,
} from "./playgroundAISession";

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
					yield {
						type: "error",
						error: new Error("The playground editor is not ready yet."),
					} as const;
					return;
				}

				const prompt = getLatestPrompt(options.messages);
				for await (const chunk of streamPlaygroundAIResponse(
					editor,
					prompt,
					options.signal,
				)) {

					if (chunk.type === "text-delta" && typeof chunk.delta === "string") {
						yield {
							type: "text-delta",
							delta: chunk.delta,
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
						yield { type: "done" as const };
						return;
					}

					if (chunk.type === "error") {
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

				yield { type: "done" as const };
			} catch (error) {
				if (options.signal?.aborted) {
					return;
				}

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
