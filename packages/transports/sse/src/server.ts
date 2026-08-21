import type {
	Editor,
	PenStreamPart,
	PenStreamRequest,
	Position,
	ToolContext,
} from "@input/pen-types";
import { resolveToolExecution } from "@input/pen-core";
import { generateId, isAsyncIterable } from "@input/pen-types";
import {
	MAX_PEN_STREAM_REQUEST_BYTES,
	parsePenStreamRequest,
} from "./parsePenStreamRequest";
import type { SSEServerOptions } from "./types";

export function createSSEHandler(
	options: SSEServerOptions,
): (request: Request) => Response | Promise<Response> {
	const {
		toolRuntime,
		editor,
		onRequest,
		onError,
		pingInterval = 15_000,
	} = options;

	return async (request: Request): Promise<Response> => {
		if (request.method === "GET") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: { Allow: "POST" },
			});
		}

		let text: string;
		try {
			text = await request.text();
		} catch {
			return new Response("Bad Request", { status: 400 });
		}
		if (text.length > MAX_PEN_STREAM_REQUEST_BYTES) {
			return new Response("Bad Request", { status: 400 });
		}
		let raw: unknown;
		try {
			raw = JSON.parse(text);
		} catch {
			return new Response("Bad Request", { status: 400 });
		}
		const body = parsePenStreamRequest(raw);
		if (!body) {
			return new Response("Bad Request", { status: 400 });
		}
		onRequest?.(body);

		const streamId = generateId();
		let eventIndex = 0;

		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let pingTimer: ReturnType<typeof setInterval> | null = null;

				const send = (part: PenStreamPart): void => {
					const id = `${streamId}:${eventIndex++}`;
					const data = JSON.stringify(part);
					const event = `id: ${id}\ndata: ${data}\n\n`;
					controller.enqueue(encoder.encode(event));
				};

				const sendPing = (): void => {
					send({ type: "ping" } as PenStreamPart);
				};

				try {
					pingTimer = setInterval(sendPing, pingInterval);

					if (toolRuntime && body.toolCalls) {
						for (const toolCall of body.toolCalls) {
							const result = toolRuntime.executeTool(
								toolCall.name,
								toolCall.input,
								createTransportToolContext(
									body.context,
									send,
									editor,
								),
							);

							const resolved = await resolveToolExecution(result);
							if (isAsyncIterable(resolved)) {
								for await (const part of resolved) {
									send(part as PenStreamPart);
								}
							} else {
								send({
									type: "tool-output",
									toolCallId: toolCall.toolCallId,
									output: resolved,
								} as PenStreamPart);
							}
						}
					}

					send({ type: "done" } as PenStreamPart);
				} catch (error) {
					onError?.(error);
					send({
						type: "error",
						errorText:
							error instanceof Error
								? error.message
								: String(error),
					} as PenStreamPart);
				} finally {
					if (pingTimer) clearInterval(pingTimer);
					controller.close();
				}
			},
		});

		return new Response(stream, {
			status: 200,
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"X-Stream-Id": streamId,
			},
		});
	};
}

function createTransportToolContext(
	context: PenStreamRequest["context"],
	emit: (part: PenStreamPart) => void,
	editor: Editor | undefined,
): ToolContext {
	let activeZoneId: string | null = null;

	return {
		get editor(): Editor {
			return requireTransportEditor(editor);
		},
		docId: context?.docId ?? "",
		emit,
		insertBlock(
			blockType: string,
			props: Record<string, unknown>,
			position: Position,
		): string {
			const liveEditor = requireTransportEditor(editor);
			const blockId = generateId();

			emit({
				type: "block-insert",
				blockId,
				blockType,
				props,
				position,
			});

			liveEditor.apply(
				[{ type: "insert-block", blockId, blockType, props, position }],
				{ origin: "ai" },
			);

			return blockId;
		},
		updateBlock(blockId: string, props: Record<string, unknown>): void {
			const liveEditor = requireTransportEditor(editor);

			emit({ type: "block-update", blockId, props });
			liveEditor.apply([{ type: "update-block", blockId, props }], {
				origin: "ai",
			});
		},
		deleteBlock(blockId: string): void {
			const liveEditor = requireTransportEditor(editor);

			emit({ type: "block-delete", blockId });
			liveEditor.apply([{ type: "delete-block", blockId }], {
				origin: "ai",
			});
		},
		beginStreaming(zoneId: string, blockId: string): void {
			activeZoneId = zoneId;
			emit({ type: "gen-start", zoneId, blockId });
		},
		appendDelta(delta: string): void {
			if (!activeZoneId) {
				throw new Error("appendDelta() called before beginStreaming()");
			}
			emit({ type: "gen-delta", zoneId: activeZoneId, delta });
		},
		endStreaming(status: "complete" | "cancelled" | "error"): void {
			if (!activeZoneId) {
				throw new Error(
					"endStreaming() called before beginStreaming()",
				);
			}
			emit({ type: "gen-end", zoneId: activeZoneId, status });
			activeZoneId = null;
		},
	};
}

function requireTransportEditor(editor: Editor | undefined): Editor {
	if (editor) {
		return editor;
	}
	throw new Error("Transport tool context requires a valid editor");
}
