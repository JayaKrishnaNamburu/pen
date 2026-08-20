/**
 * Stream buffer/flush client (ST1–ST4, `spec-v2/06-commit-pipeline.md`).
 * `editor.openTextStream` wires this to apply, summaries, defer, and undo.
 */

import type {
	ApplyOptions,
	DocumentOp,
	InsertTextOp,
	OpOrigin,
	Point,
	StructuredOpOrigin,
} from "@input/pen-types";

const DEFAULT_FLUSH_INTERVAL_MS = 24;
const MIN_FLUSH_INTERVAL_MS = 16;
const MAX_FLUSH_INTERVAL_MS = 100;
const STREAM_SOURCE = "stream";

export interface TextStreamWriter {
	append(text: string, marks?: Record<string, unknown>): void;
	splice(from: number, to: number, text: string): void;
	readonly position: Point;
	flush(): void;
	close(): void;
	abort(): void;
}

export interface CreateTextStreamWriterOptions {
	apply: (ops: DocumentOp[], options?: ApplyOptions) => void;
	getPoint: () => Point;
	mapPoint?: (point: Point) => Point;
	onClose?: (info: { deferNormalization: boolean }) => void;
	origin?: OpOrigin;
	flushIntervalMs?: number;
	deferNormalization?: boolean;
}

type Pending =
	| {
			kind: "append";
			text: string;
			marks?: Record<string, unknown>;
	  }
	| {
			kind: "splice";
			from: number;
			to: number;
			text: string;
	  };

type WriterStatus = "open" | "closed" | "aborted";

function clampFlushIntervalMs(ms: number): number {
	if (ms < MIN_FLUSH_INTERVAL_MS) {
		return MIN_FLUSH_INTERVAL_MS;
	}
	if (ms > MAX_FLUSH_INTERVAL_MS) {
		return MAX_FLUSH_INTERVAL_MS;
	}
	return ms;
}

export function resolveStreamOrigin(origin: OpOrigin | undefined): StructuredOpOrigin {
	if (origin === undefined || typeof origin === "string") {
		return {
			type: origin ?? "ai",
			source: STREAM_SOURCE,
		};
	}

	return {
		type: origin.type,
		groupId: origin.groupId,
		requestId: origin.requestId,
		actorId: origin.actorId,
		source: STREAM_SOURCE,
	};
}

function mapHeadThroughSplice(
	offset: number,
	from: number,
	to: number,
	insertLength: number,
): number {
	if (offset < from) {
		return offset;
	}
	if (offset <= to) {
		return from + insertLength;
	}
	return offset + insertLength - (to - from);
}

function spliceOp(
	blockId: string,
	from: number,
	to: number,
	text: string,
): DocumentOp {
	const length = to - from;
	if (length === 0) {
		return { type: "insert-text", blockId, offset: from, text };
	}
	if (text.length === 0) {
		return { type: "delete-text", blockId, offset: from, length };
	}
	return { type: "replace-text", blockId, offset: from, length, text };
}

export function createTextStreamWriter(
	options: CreateTextStreamWriterOptions,
): TextStreamWriter {
	const flushIntervalMs = clampFlushIntervalMs(
		options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS,
	);
	const deferNormalization = options.deferNormalization ?? true;
	const origin = resolveStreamOrigin(options.origin);

	let status: WriterStatus = "open";
	let timer: ReturnType<typeof setTimeout> | null = null;
	const pending: Pending[] = [];
	let pendingHeadDelta = 0;

	function committedPoint(): Point {
		const point = options.getPoint();
		return options.mapPoint?.(point) ?? point;
	}

	function clearTimer(): void {
		if (timer === null) {
			return;
		}
		clearTimeout(timer);
		timer = null;
	}

	function scheduleFlush(): void {
		if (timer !== null) {
			return;
		}
		timer = setTimeout(() => {
			timer = null;
			flush();
		}, flushIntervalMs);
	}

	function buildOps(blockId: string, writeHead: number): DocumentOp[] {
		const ops: DocumentOp[] = [];
		let appendOffset = writeHead;

		for (const item of pending) {
			switch (item.kind) {
				case "append": {
					const op: InsertTextOp = {
						type: "insert-text",
						blockId,
						offset: appendOffset,
						text: item.text,
					};
					if (item.marks !== undefined) {
						op.marks = item.marks;
					}
					ops.push(op);
					appendOffset += item.text.length;
					break;
				}
				case "splice":
					ops.push(spliceOp(blockId, item.from, item.to, item.text));
					appendOffset = mapHeadThroughSplice(
						appendOffset,
						item.from,
						item.to,
						item.text.length,
					);
					break;
				default: {
					const _exhaustive: never = item;
					return _exhaustive;
				}
			}
		}

		return ops;
	}

	function flush(): void {
		if (status !== "open") {
			return;
		}

		clearTimer();
		if (pending.length === 0) {
			return;
		}

		const head = committedPoint();
		const ops = buildOps(head.blockId, head.offset);
		pending.length = 0;
		pendingHeadDelta = 0;
		options.apply(ops, { origin });
	}

	return {
		get position(): Point {
			const head = committedPoint();
			return {
				blockId: head.blockId,
				offset: head.offset + pendingHeadDelta,
			};
		},

		append(text: string, marks?: Record<string, unknown>): void {
			if (status !== "open" || text.length === 0) {
				return;
			}

			const last = pending[pending.length - 1];
			if (last?.kind === "append" && last.marks === marks) {
				last.text += text;
			} else {
				pending.push({ kind: "append", text, marks });
			}
			pendingHeadDelta += text.length;
			scheduleFlush();
		},

		splice(from: number, to: number, text: string): void {
			if (status !== "open") {
				return;
			}

			const committed = committedPoint().offset;
			const liveHead = committed + pendingHeadDelta;
			pending.push({ kind: "splice", from, to, text });
			pendingHeadDelta =
				mapHeadThroughSplice(liveHead, from, to, text.length) - committed;
			scheduleFlush();
		},

		flush,

		close(): void {
			if (status !== "open") {
				return;
			}

			flush();
			status = "closed";
			options.onClose?.({ deferNormalization });
		},

		abort(): void {
			if (status !== "open") {
				return;
			}

			status = "aborted";
			clearTimer();
			pending.length = 0;
			pendingHeadDelta = 0;
		},
	};
}
