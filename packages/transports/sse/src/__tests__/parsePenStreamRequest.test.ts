import { describe, expect, it } from "vitest";
import type { PenStreamRequest } from "@input/pen-types";
import {
	PEN_STREAM_REQUEST_CONTEXT_KEYS,
	PEN_STREAM_REQUEST_KEYS,
	parsePenStreamRequest,
} from "../parsePenStreamRequest";

type Assert<T extends true> = T;
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type _ParserKeysLocked = Assert<
	Equal<keyof PenStreamRequest, (typeof PEN_STREAM_REQUEST_KEYS)[number]>
>;
type StreamRequestContext = NonNullable<PenStreamRequest["context"]>;
type _ContextKeysLocked = Assert<
	Equal<
		keyof StreamRequestContext,
		(typeof PEN_STREAM_REQUEST_CONTEXT_KEYS)[number]
	>
>;

const MALFORMED_BY_KEY = {
	prompt: 1,
	context: [],
	tools: "not-an-array",
	toolCalls: { not: "array" },
	messages: "not-an-array",
	signal: {},
	streamId: 1,
	protocolVersion: "1",
} as const satisfies { [K in keyof PenStreamRequest]-?: unknown };

const MALFORMED_CONTEXT_BY_KEY = {
	docId: { nested: true },
	selection: 1,
	blockId: 1,
} as const satisfies { [K in keyof StreamRequestContext]-?: unknown };

const WELL_FORMED_BODY = {
	prompt: "x",
	context: {
		docId: "doc-1",
		blockId: "b1",
		selection: {
			type: "text",
			anchor: { blockId: "b1", offset: 0 },
			focus: { blockId: "b1", offset: 2 },
		},
	},
	tools: [
		{
			name: "echo",
			description: "echo",
			inputSchema: { type: "object" },
		},
	],
	toolCalls: [{ toolCallId: "tc-1", name: "echo", input: { msg: "hi" } }],
	messages: [{ role: "user", content: "hello" }],
	streamId: "s1",
	protocolVersion: 1,
} satisfies Record<string, unknown>;


describe("parsePenStreamRequest", () => {
	it("accepts a well-formed body with every optional field", () => {
		expect(parsePenStreamRequest(WELL_FORMED_BODY)).toEqual(WELL_FORMED_BODY);
	});

	it("accepts a body that is only a string prompt", () => {
		expect(parsePenStreamRequest({ prompt: "x" })).toEqual({ prompt: "x" });
	});

	it("accepts a live AbortSignal on an in-process value", () => {
		const signal = new AbortController().signal;
		expect(parsePenStreamRequest({ prompt: "x", signal })).toEqual({
			prompt: "x",
			signal,
		});
	});

	it("rejects null, arrays, and non-objects", () => {
		expect(parsePenStreamRequest(null)).toBeNull();
		expect(parsePenStreamRequest([])).toBeNull();
		expect(parsePenStreamRequest("prompt")).toBeNull();
		expect(parsePenStreamRequest(1)).toBeNull();
	});

	it("rejects a missing prompt", () => {
		expect(parsePenStreamRequest({})).toBeNull();
	});

	it("rejects a top-level editor", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				editor: { apply: 1, internals: 1 },
			}),
		).toBeNull();
	});

	it("rejects context.editor", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				context: { editor: { apply: 1, internals: 1 } },
			}),
		).toBeNull();
	});

	it("rejects an unknown top-level key", () => {
		expect(parsePenStreamRequest({ prompt: "x", extra: 1 })).toBeNull();
	});

	it("rejects an unknown context key", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				context: { docId: "doc-1", extra: 1 },
			}),
		).toBeNull();
	});

	describe("rejects a malformed value for each PenStreamRequest field", () => {
		for (const key of PEN_STREAM_REQUEST_KEYS) {
			it(`rejects malformed ${key}`, () => {
				expect(
					parsePenStreamRequest({
						...WELL_FORMED_BODY,
						[key]: MALFORMED_BY_KEY[key],
					}),
				).toBeNull();
			});
		}
	});

	describe("rejects a malformed value for each context field", () => {
		for (const key of PEN_STREAM_REQUEST_CONTEXT_KEYS) {
			it(`rejects malformed context.${key}`, () => {
				expect(
					parsePenStreamRequest({
						prompt: "x",
						context: { [key]: MALFORMED_CONTEXT_BY_KEY[key] },
					}),
				).toBeNull();
			});
		}
	});

	it("rejects a toolCalls item whose name is not a string", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				toolCalls: [{ toolCallId: "tc-1", name: 1, input: {} }],
			}),
		).toBeNull();
	});

	it("rejects a toolCalls item missing toolCallId", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				toolCalls: [{ name: "echo", input: {} }],
			}),
		).toBeNull();
	});

	it("rejects a tools item whose inputSchema is not an object", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				tools: [{ name: "echo", description: "echo", inputSchema: 1 }],
			}),
		).toBeNull();
	});

	it("rejects a message with an unknown role", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				messages: [{ role: "root", content: "x" }],
			}),
		).toBeNull();
	});

	it("rejects a text selection whose offset is not a number", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				context: {
					selection: {
						type: "text",
						anchor: { blockId: "b1", offset: "0" },
						focus: { blockId: "b1", offset: 0 },
					},
				},
			}),
		).toBeNull();
	});

	it("rejects a negative or fractional text offset", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				context: {
					selection: {
						type: "text",
						anchor: { blockId: "b1", offset: -1 },
						focus: { blockId: "b1", offset: 0 },
					},
				},
			}),
		).toBeNull();
		expect(
			parsePenStreamRequest({
				prompt: "x",
				context: {
					selection: {
						type: "text",
						anchor: { blockId: "b1", offset: 0.5 },
						focus: { blockId: "b1", offset: 1 },
					},
				},
			}),
		).toBeNull();
	});

	it("rejects a protocolVersion that is not PEN_STREAM_PROTOCOL_VERSION", () => {
		expect(
			parsePenStreamRequest({
				...WELL_FORMED_BODY,
				protocolVersion: 2,
			}),
		).toBeNull();
	});

	it("rejects an extra field on a toolCalls item", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				toolCalls: [
					{ toolCallId: "tc-1", name: "echo", input: {}, extra: 1 },
				],
			}),
		).toBeNull();
	});
});
