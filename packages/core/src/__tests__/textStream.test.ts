import type { ApplyOptions, DocumentOp, Point } from "@input/pen-types";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	createTextStreamWriter,
	type CreateTextStreamWriterOptions,
} from "../editor/textStream";

afterEach(() => {
	vi.useRealTimers();
});

function originOf(entry: { options?: ApplyOptions } | undefined): {
	groupId?: string;
	source?: string;
	type?: string;
} {
	const origin = entry?.options?.origin;
	if (origin == null || typeof origin === "string") {
		return { type: origin };
	}
	return origin;
}

function createWriter(overrides: Partial<CreateTextStreamWriterOptions> = {}): {
	writer: ReturnType<typeof createTextStreamWriter>;
	applies: Array<{ ops: DocumentOp[]; options?: ApplyOptions }>;
	point: { current: Point };
} {
	const applies: Array<{ ops: DocumentOp[]; options?: ApplyOptions }> = [];
	const point = { current: { blockId: "b1", offset: 0 } };

	const apply =
		overrides.apply ??
		((ops: DocumentOp[], options?: ApplyOptions) => {
			applies.push({ ops, options });
			for (const op of ops) {
				if (
					op.type !== "splice-text" ||
					op.blockId !== point.current.blockId
				) {
					continue;
				}
				const insert = typeof op.insert === "string" ? op.insert : "";
				if (op.from <= point.current.offset) {
					point.current = {
						blockId: point.current.blockId,
						offset: point.current.offset + insert.length,
					};
				}
			}
		});

	const writer = createTextStreamWriter({
		apply,
		getPoint: overrides.getPoint ?? (() => point.current),
		origin: overrides.origin ?? { type: "ai", groupId: "stream-1" },
		...overrides,
	});

	return { writer, applies, point };
}

describe("createTextStreamWriter", () => {
	it("ST1: each flush is one apply with source stream", () => {
		const { writer, applies } = createWriter();

		writer.append("hel");
		writer.append("lo");
		expect(applies).toHaveLength(0);

		writer.flush();
		expect(applies).toHaveLength(1);
		expect(applies[0]?.ops).toEqual([
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0,
				insert: "hello",
			},
		]);
		expect(originOf(applies[0])).toMatchObject({
			type: "ai",
			groupId: "stream-1",
			source: "stream",
		});

		writer.append("!");
		writer.flush();
		expect(applies).toHaveLength(2);
		expect(applies[1]?.ops).toEqual([
			{
				type: "splice-text",
				blockId: "b1",
				from: 5,
				to: 5,
				insert: "!",
			},
		]);

		writer.splice(0, 5, "Hello");
		writer.flush();
		expect(applies).toHaveLength(3);
		expect(applies[2]?.ops).toEqual([
			{
				type: "splice-text",
				blockId: "b1",
				from: 0,
				to: 0 + 5,
				insert: "Hello",
			},
		]);
	});

	it("ST1: empty flush does not apply", () => {
		const { writer, applies } = createWriter();
		writer.flush();
		expect(applies).toHaveLength(0);
	});

	it("ST1: flushIntervalMs defaults to 24 and clamps to [16, 100]", () => {
		vi.useFakeTimers();
		const defaultWriter = createWriter();
		defaultWriter.writer.append("a");
		vi.advanceTimersByTime(23);
		expect(defaultWriter.applies).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(defaultWriter.applies).toHaveLength(1);

		const low = createWriter({ flushIntervalMs: 1 });
		low.writer.append("a");
		vi.advanceTimersByTime(15);
		expect(low.applies).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(low.applies).toHaveLength(1);

		const high = createWriter({ flushIntervalMs: 1000 });
		high.writer.append("a");
		vi.advanceTimersByTime(99);
		expect(high.applies).toHaveLength(0);
		vi.advanceTimersByTime(1);
		expect(high.applies).toHaveLength(1);
	});

	it("ST1: abort drops the buffer", () => {
		vi.useFakeTimers();
		const closes: Array<{ deferNormalization: boolean }> = [];
		const { writer, applies } = createWriter({
			onClose: (info) => {
				closes.push(info);
			},
		});
		writer.append("hello");
		writer.abort();
		writer.flush();
		writer.append("world");
		writer.close();
		vi.advanceTimersByTime(100);
		expect(applies).toHaveLength(0);
		expect(closes).toHaveLength(0);
	});

	it("ST2: position tracks getPoint plus pending delta", () => {
		const applies: DocumentOp[][] = [];
		const point = { current: { blockId: "b1", offset: 1 } };
		const writer = createTextStreamWriter({
			apply: (ops) => {
				applies.push(ops);
			},
			getPoint: () => point.current,
			origin: { type: "ai", groupId: "stream-1" },
		});

		expect(writer.position).toEqual({ blockId: "b1", offset: 1 });

		writer.append("ab");
		expect(writer.position).toEqual({ blockId: "b1", offset: 3 });

		point.current = { blockId: "b1", offset: 4 };
		expect(writer.position).toEqual({ blockId: "b1", offset: 6 });

		writer.flush();
		expect(applies).toEqual([
			[
				{
					type: "splice-text",
					blockId: "b1",
					from: 4,
					to: 4,
					insert: "ab",
				},
			],
		]);
	});

	it("ST3: close records deferNormalization without undefer", () => {
		const closes: Array<{ deferNormalization: boolean }> = [];
		const { writer, applies } = createWriter({
			onClose: (info) => {
				closes.push(info);
			},
		});

		writer.append("ok");
		writer.close();

		expect(applies).toHaveLength(1);
		expect(closes).toEqual([{ deferNormalization: true }]);

		const skipped: Array<{ deferNormalization: boolean }> = [];
		const explicit = createWriter({
			deferNormalization: false,
			onClose: (info) => {
				skipped.push(info);
			},
		});
		explicit.writer.close();
		expect(explicit.applies).toHaveLength(0);
		expect(skipped).toEqual([{ deferNormalization: false }]);
	});

	it("ST4: stream commits share the origin groupId", () => {
		const { writer, applies } = createWriter({
			origin: {
				type: "ai",
				groupId: "gen-9",
				requestId: "req-1",
			},
		});

		writer.append("one");
		writer.flush();
		writer.append("two");
		writer.flush();

		expect(applies).toHaveLength(2);
		expect(originOf(applies[0])).toMatchObject({
			groupId: "gen-9",
			requestId: "req-1",
			source: "stream",
		});
		expect(originOf(applies[1])).toMatchObject({
			groupId: "gen-9",
			requestId: "req-1",
			source: "stream",
		});
	});
});
