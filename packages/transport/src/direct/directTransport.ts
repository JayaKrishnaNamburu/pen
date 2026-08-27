import type {
	Editor,
	PenStreamPart,
	PenStreamRequest,
	PenTransport,
	Position,
	ToolContext,
	ToolRuntime,
	Unsubscribe,
} from "@input/pen-types";
import {
	createAIToolTurn,
	isAIToolCallDenied,
	openAIToolCall,
} from "@input/pen-ai/tools";
import { generateId, isAsyncIterable } from "@input/pen-types";

export interface DirectTransportOptions {
	toolRuntime: ToolRuntime;
	/**
	 * In-process editor for tool context. Direct never reads an editor
	 * off `PenStreamRequest` — that field is not on the wire type (AIB2).
	 */
	editor?: Editor;
	/**
	 * Mutating tools the model may invoke on this transport. Default deny.
	 */
	allowedMutatingTools?: readonly string[];
	onError?: (error: unknown) => void;
}

export function directTransport(options: DirectTransportOptions): PenTransport {
	const { toolRuntime, editor, onError, allowedMutatingTools = [] } = options;
	const activeControllers = new Set<AbortController>();

	const transport: PenTransport = {
		async *stream(
			request: PenStreamRequest,
		): AsyncGenerator<PenStreamPart> {
			const controller = new AbortController();
			activeControllers.add(controller);
			const signal = controller.signal;

			try {
				const turn = createAIToolTurn({ allowedMutatingTools });
				for (const toolCall of request.toolCalls ?? []) {
					if (signal.aborted) break;

					const context = createTransportToolContext(
						request.context,
						() => {},
						editor,
					);
					const opened = await openAIToolCall(
						toolRuntime,
						toolCall.name,
						toolCall.input,
						context,
						turn,
					);
					if (!opened.ok) {
						yield {
							type: "tool-error",
							toolCallId: toolCall.toolCallId,
							error: opened.denial.reason,
						} as PenStreamPart;
						continue;
					}

					try {
						const result = toolRuntime.executeTool(
							toolCall.name,
							toolCall.input,
							context,
						);

						const resolved = await result;
						if (isAsyncIterable(resolved)) {
							yield* iterateUntilAborted(resolved, signal);
							const closed = opened.close();
							if (isAIToolCallDenied(closed)) {
								yield {
									type: "tool-error",
									toolCallId: toolCall.toolCallId,
									error: closed.reason,
								} as PenStreamPart;
							}
						} else if (!signal.aborted) {
							const closed = opened.close(resolved);
							if (isAIToolCallDenied(closed)) {
								yield {
									type: "tool-error",
									toolCallId: toolCall.toolCallId,
									error: closed.reason,
								} as PenStreamPart;
							} else {
								yield {
									type: "tool-output",
									toolCallId: toolCall.toolCallId,
									output: closed,
								} as PenStreamPart;
							}
						} else {
							opened.close();
						}
					} finally {
						// `close()` restores the patched editor.apply and is
						// idempotent, so the paths above that already closed are
						// unaffected. This must not be a `catch`: abandoning the
						// stream mid-`yield` resumes the generator with a return
						// completion, which runs `finally` and skips `catch`,
						// leaving a read-only guard that silently drops every
						// later write.
						opened.close();
					}
				}

				if (signal.aborted) {
					yield {
						type: "abort",
						reason: "disconnected",
					} as PenStreamPart;
					return;
				}
				yield { type: "done" } as PenStreamPart;
			} catch (error) {
				onError?.(error);
				yield {
					type: "error",
					errorText:
						error instanceof Error ? error.message : String(error),
				} as PenStreamPart;
			} finally {
				activeControllers.delete(controller);
			}
		},

		async connect(): Promise<void> {
			// No-op — always connected
		},

		async disconnect(): Promise<void> {
			for (const controller of activeControllers) {
				controller.abort();
			}
			activeControllers.clear();
		},

		get connected(): boolean {
			return true;
		},

		onConnectionChange(
			_callback: (connected: boolean) => void,
		): Unsubscribe {
			return () => {};
		},
	};

	return transport;
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
			liveEditor.apply([{ type: "set-props", blockId, props }], {
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

async function* iterateUntilAborted(
	iterable: AsyncIterable<unknown>,
	signal: AbortSignal,
): AsyncGenerator<PenStreamPart> {
	const iterator = iterable[Symbol.asyncIterator]();
	const aborted = waitForAbort(signal);
	try {
		while (!signal.aborted) {
			const next = await Promise.race([
				iterator.next(),
				aborted.then(() => ({ done: true as const, value: undefined })),
			]);
			if (signal.aborted || next.done) {
				break;
			}
			yield next.value as PenStreamPart;
		}
	} finally {
		try {
			await iterator.return?.();
		} catch {
			// generator cleanup must not become a stream error
		}
	}
}

function waitForAbort(signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		signal.addEventListener("abort", () => resolve(), { once: true });
	});
}
