import type { ModelMessage } from "@input/pen-types";
import type { ChatEvent, ChatRequest } from "./protocol";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-5";

/**
 * Pen decides what kind of answer it wants and shows it in the request: tools
 * mean "change the document", no tools mean "give me prose for a block". Any
 * text the model writes is inserted into the document, so a chatty preamble
 * ends up in the user's paragraph — hence the blunt instructions.
 */
const SYSTEM_PROMPT = [
	"You are a writing assistant embedded in a rich text document.",
	"",
	"When the request offers tools: read the document first if you need context,",
	"then make every change through tool calls. Prefer write_document with",
	"markdown. Do not write any prose in your reply — it would be inserted into",
	"the document as content.",
	"",
	"When the request offers no tools: reply with the document text itself and",
	"nothing else. No preamble, no explanation, no quotes around it.",
].join("\n");

/**
 * Talks to Anthropic and translates its stream into `ChatEvent`s.
 *
 * Two translations happen here, and they are the only reason this file is
 * longer than the scripted model: Pen's message shape into Anthropic's content
 * blocks on the way out, and Anthropic's server-sent events into our
 * newline-delimited events on the way back.
 */
export async function* streamAnthropic(
	request: ChatRequest,
	apiKey: string,
	signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
	const response = await fetch(ANTHROPIC_URL, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		},
		body: JSON.stringify({
			model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
			max_tokens: 4096,
			stream: true,
			system: SYSTEM_PROMPT,
			messages: request.messages.map(toAnthropicMessage),
			tools: request.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				input_schema: tool.inputSchema,
			})),
		}),
		signal,
	});

	if (!response.ok || !response.body) {
		yield {
			type: "error",
			error: `Anthropic responded ${response.status}: ${await response.text()}`,
		};
		return;
	}

	yield* readAnthropicStream(response.body, signal);
}

// ── Pen messages → Anthropic content blocks ─────────────────

function toAnthropicMessage(message: ModelMessage) {
	// Anthropic has no tool role: tool results are user turns.
	const role = message.role === "assistant" ? "assistant" : "user";

	if (typeof message.content === "string") {
		return { role, content: message.content };
	}

	const content = message.content.map((part) => {
		switch (part.type) {
			case "text":
				return { type: "text", text: part.text };
			case "tool-call":
				return {
					type: "tool_use",
					id: part.toolCallId,
					name: part.toolName,
					input: part.input,
				};
			case "tool-result":
				return {
					type: "tool_result",
					tool_use_id: part.toolCallId,
					content: JSON.stringify(part.result ?? null),
					is_error: part.isError === true,
				};
			default: {
				const unhandled: never = part;
				throw new Error(
					`Unsupported message part: ${JSON.stringify(unhandled)}`,
				);
			}
		}
	});

	return { role, content };
}

// ── Anthropic server-sent events → ChatEvents ───────────────

interface PendingToolCall {
	toolCallId: string;
	toolName: string;
	json: string;
}

/**
 * Anthropic sends tool arguments as a stream of JSON fragments, so a tool call
 * is only complete at `content_block_stop`. Everything else maps one to one.
 */
async function* readAnthropicStream(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
	let pendingToolCall: PendingToolCall | null = null;

	for await (const event of readServerSentEvents(body, signal)) {
		switch (event.type) {
			case "content_block_start": {
				if (event.content_block?.type === "tool_use") {
					pendingToolCall = {
						toolCallId: event.content_block.id ?? "",
						toolName: event.content_block.name ?? "",
						json: "",
					};
				}
				break;
			}

			case "content_block_delta": {
				if (event.delta?.type === "text_delta" && event.delta.text) {
					yield { type: "text-delta", delta: event.delta.text };
				}
				if (
					event.delta?.type === "input_json_delta" &&
					pendingToolCall
				) {
					pendingToolCall.json += event.delta.partial_json ?? "";
				}
				break;
			}

			case "content_block_stop": {
				if (pendingToolCall) {
					yield {
						type: "tool-call",
						toolCallId: pendingToolCall.toolCallId,
						toolName: pendingToolCall.toolName,
						input: parseToolInput(pendingToolCall.json),
					};
					pendingToolCall = null;
				}
				break;
			}

			case "error": {
				yield {
					type: "error",
					error: event.error?.message ?? "Unknown error",
				};
				return;
			}

			default:
				break;
		}
	}

	yield { type: "done" };
}

function parseToolInput(json: string): unknown {
	if (json.trim().length === 0) {
		return {};
	}

	try {
		return JSON.parse(json);
	} catch {
		return {};
	}
}

interface AnthropicStreamEvent {
	type: string;
	content_block?: { type?: string; id?: string; name?: string };
	delta?: { type?: string; text?: string; partial_json?: string };
	error?: { message?: string };
}

/** Minimal SSE reader: we only need the `data:` lines. */
async function* readServerSentEvents(
	body: ReadableStream<Uint8Array>,
	signal: AbortSignal,
): AsyncGenerator<AnthropicStreamEvent> {
	const decoder = new TextDecoder();
	let pending = "";

	for await (const chunk of body) {
		if (signal.aborted) {
			return;
		}

		pending += decoder.decode(chunk, { stream: true });
		const lines = pending.split("\n");
		pending = lines.pop() ?? "";

		for (const line of lines) {
			if (!line.startsWith("data:")) {
				continue;
			}
			try {
				yield JSON.parse(
					line.slice("data:".length),
				) as AnthropicStreamEvent;
			} catch {
				// Keep-alive or partial frame: nothing to report.
			}
		}
	}
}
