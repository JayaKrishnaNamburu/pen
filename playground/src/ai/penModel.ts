import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { getStoredAnthropicKey } from "./apiKey";

const CHAT_ENDPOINT = "/api/chat";

/**
 * Connects Pen's AI extension to the playground server.
 *
 * Pen hands us the conversation so far plus the document tools it is willing
 * to run. We forward both to the server, which asks a model what to do, and
 * stream the reply back as `ModelStreamEvent`s.
 *
 * Note what this file does *not* do: it never touches the editor. When the
 * model asks to change the document it emits a `tool-call`, and Pen runs that
 * tool itself against the document. That is the seam that keeps every edit —
 * whether typed by a person or written by a model — on one code path.
 */
export function createPenModel(): ModelAdapter {
	return {
		capabilities: {
			partialToolInput: true,
			forcedToolChoice: true,
		},
		async *stream({ messages, tools, signal, toolChoice }) {
			let response: Response;

			try {
				const storedKey = getStoredAnthropicKey();
				response = await fetch(CHAT_ENDPOINT, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						...(storedKey
							? { "x-anthropic-api-key": storedKey }
							: {}),
					},
					body: JSON.stringify({ messages, tools, toolChoice }),
					signal,
				});
			} catch (error) {
				if (signal?.aborted) {
					return;
				}
				yield {
					type: "error",
					error: new Error(
						"Could not reach /api/chat. Is the playground dev server running?",
						{ cause: error },
					),
				};
				return;
			}

			if (!response.ok || !response.body) {
				yield {
					type: "error",
					error: new Error(
						`AI server responded ${response.status} ${response.statusText}.`,
					),
				};
				return;
			}

			yield* readModelEvents(response.body, signal);
		},
	};
}

/**
 * The server streams one JSON event per line. Newline-delimited JSON keeps the
 * client parser to a handful of lines, unlike the SSE framing most providers
 * use.
 */
async function* readModelEvents(
	body: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncGenerator<ModelStreamEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let pending = "";

	try {
		while (!signal?.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			pending += decoder.decode(value, { stream: true });
			const lines = pending.split("\n");
			// The last entry is either empty or a partial line: keep it buffered.
			pending = lines.pop() ?? "";

			for (const line of lines) {
				const event = parseModelEvent(line);
				if (event) {
					yield event;
				}
			}
		}
	} finally {
		void reader.cancel();
	}
}

function parseModelEvent(line: string): ModelStreamEvent | null {
	if (line.trim().length === 0) {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch {
		return null;
	}

	if (
		typeof parsed !== "object" ||
		parsed === null ||
		typeof (parsed as { type?: unknown }).type !== "string"
	) {
		return null;
	}

	const event = parsed as ModelStreamEvent;

	// Errors cross the wire as plain strings; Pen expects something throwable.
	if (event.type === "error") {
		return { type: "error", error: new Error(String(event.error)) };
	}

	return event;
}
