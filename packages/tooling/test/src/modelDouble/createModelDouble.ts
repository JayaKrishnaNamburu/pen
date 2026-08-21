import type {
	AIRequestContext,
	AIRequestFilter,
	ModelAdapter,
	ModelStreamEvent,
	PenStreamPart,
} from "@input/pen-types";

export type ModelDoubleFeature = AIRequestContext["feature"];

export interface ModelDoubleToolCall {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly input: unknown;
}

/** A scripted adapter event, including malformed shapes hosts need to inject. */
export type ModelDoubleEvent = ModelStreamEvent | ModelDoubleMalformedPart;

/** A stream part that is not a valid `PenStreamPart` (unknown type, missing fields). */
export interface ModelDoubleMalformedPart {
	readonly type: string;
	readonly [key: string]: unknown;
}

export type ModelDoublePart = PenStreamPart | ModelDoubleMalformedPart;

export interface ModelDoubleResponse {
	readonly events?: readonly ModelDoubleEvent[];
	readonly text?: string | readonly string[];
	readonly toolCalls?: readonly ModelDoubleToolCall[];
	readonly error?: unknown;
	/** Yield this many compiled events, then stop (no trailing `done`). */
	readonly abortAfter?: number;
}

export interface ModelDoubleOptions {
	readonly responses?: readonly ModelDoubleResponse[];
	/** Prepended to each response that does not set its own `toolCalls`. */
	readonly toolCalls?: readonly ModelDoubleToolCall[];
	/** Scripted `processStream` / transport parts, including malformed ones. */
	readonly parts?: readonly ModelDoublePart[];
	/** Feature stamped on contexts synthesized from `stream()`. */
	readonly feature?: ModelDoubleFeature;
	/** AIB1 filter applied before a context is recorded or streamed. */
	readonly filter?: AIRequestFilter;
	/** Fixed wait before each yielded event or part. Default 0 — no timer. */
	readonly delayMs?: number;
	/** Cap compiled adapter events (and `parts`) after this many yields. */
	readonly abortAfter?: number;
}

export interface ModelDouble extends ModelAdapter {
	readonly requests: readonly AIRequestContext[];
	request(
		context: AIRequestContext,
		signal?: AbortSignal,
	): AsyncIterable<ModelStreamEvent>;
	streamParts(signal?: AbortSignal): AsyncIterable<ModelDoublePart>;
}

export function createModelDouble(
	options: ModelDoubleOptions = {},
): ModelDouble {
	const requests: AIRequestContext[] = [];
	const responses = options.responses ?? [];
	const delayMs = options.delayMs ?? 0;
	const feature = options.feature ?? "generation";
	let nextResponse = 0;

	function record(context: AIRequestContext): boolean {
		const next = options.filter ? options.filter(context) : context;
		if (next === null) {
			return false;
		}
		requests.push(next);
		return true;
	}

	function takeEvents(): ModelDoubleEvent[] {
		const response =
			responses.length === 0
				? {}
				: responses[Math.min(nextResponse, responses.length - 1)]!;
		nextResponse += 1;
		const compiled = compileEvents(response, options.toolCalls);
		const cap = response.abortAfter ?? options.abortAfter;
		return cap == null ? compiled : compiled.slice(0, cap);
	}

	function takeParts(): ModelDoublePart[] {
		const parts = options.parts ?? [];
		return options.abortAfter == null
			? [...parts]
			: parts.slice(0, options.abortAfter);
	}

	async function* emitEvents(
		signal?: AbortSignal,
	): AsyncIterable<ModelStreamEvent> {
		for (const event of takeEvents()) {
			await wait(delayMs, signal);
			if (signal?.aborted) {
				return;
			}
			yield event as ModelStreamEvent;
		}
	}

	return {
		get requests() {
			return requests;
		},
		async *stream(streamOptions) {
			const provided = (
				streamOptions as typeof streamOptions & {
					context?: AIRequestContext;
				}
			).context;
			const context: AIRequestContext = provided ?? {
				feature,
				messages: streamOptions.messages,
				documentExcerpts: [],
				tools: streamOptions.tools,
			};
			if (!record(context)) {
				return;
			}
			yield* emitEvents(streamOptions.signal);
		},
		async *request(context, signal) {
			if (!record(context)) {
				return;
			}
			yield* emitEvents(signal);
		},
		async *streamParts(signal) {
			for (const part of takeParts()) {
				await wait(delayMs, signal);
				if (signal?.aborted) {
					return;
				}
				yield part;
			}
		},
	};
}

function compileEvents(
	response: ModelDoubleResponse,
	fallbackToolCalls: readonly ModelDoubleToolCall[] | undefined,
): ModelDoubleEvent[] {
	const events: ModelDoubleEvent[] = [];
	const toolCalls = response.toolCalls ?? fallbackToolCalls ?? [];

	for (const call of toolCalls) {
		events.push({
			type: "tool-call",
			toolCallId: call.toolCallId,
			toolName: call.toolName,
			input: call.input,
		});
	}

	if (response.events) {
		events.push(...response.events);
		return events;
	}

	if (typeof response.text === "string") {
		events.push({ type: "text-delta", delta: response.text });
	} else if (response.text) {
		for (const delta of response.text) {
			events.push({ type: "text-delta", delta });
		}
	}

	if (response.error !== undefined) {
		events.push({ type: "error", error: response.error });
		return events;
	}

	if (response.abortAfter == null) {
		events.push({ type: "done" });
	}
	return events;
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
	if (ms <= 0 || signal?.aborted) {
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const id = setTimeout(resolve, ms);
		signal?.addEventListener(
			"abort",
			() => {
				clearTimeout(id);
				resolve();
			},
			{ once: true },
		);
	});
}
