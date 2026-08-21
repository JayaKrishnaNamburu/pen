import { describe, expect, it, vi } from "vitest";
import { createSSEHandler } from "../server";
import {
	MAX_PEN_STREAM_REQUEST_ARRAY_ITEMS,
	MAX_PEN_STREAM_REQUEST_BYTES,
	MAX_PEN_STREAM_REQUEST_DEPTH,
	parsePenStreamRequest,
} from "../parsePenStreamRequest";

const TOOL_CALL = {
	toolCallId: "tc-1",
	name: "echo",
	input: {},
};

function nest(depth: number): unknown {
	let current: unknown = 1;
	for (let i = 0; i < depth; i++) {
		current = { n: current };
	}
	return current;
}

function parseFromJson(text: string): ReturnType<typeof parsePenStreamRequest> {
	return parsePenStreamRequest(JSON.parse(text));
}

async function postBody(body: unknown): Promise<{
	status: number;
	executeTool: ReturnType<typeof vi.fn>;
	onRequest: ReturnType<typeof vi.fn>;
}> {
	const executeTool = vi.fn(async () => "should-not-run");
	const onRequest = vi.fn();
	const handler = createSSEHandler({
		toolRuntime: {
			registerTool() {},
			unregisterTool() {},
			listTools: () => [],
			getTool: () => null,
			executeTool,
		},
		onRequest,
		pingInterval: 60_000,
	});
	const raw = typeof body === "string" ? body : JSON.stringify(body);
	const response = await handler(
		new Request("http://localhost/sse", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: raw,
		}),
	);
	return { status: response.status, executeTool, onRequest };
}

async function expectRejectedBeforeExecution(body: unknown): Promise<void> {
	const { status, executeTool, onRequest } = await postBody(body);
	expect(status).toBe(400);
	expect(executeTool).not.toHaveBeenCalled();
	expect(onRequest).not.toHaveBeenCalled();
}

const HOSTILE_BODIES: Array<{ name: string; body: unknown }> = [
	{ name: "missing prompt", body: { toolCalls: [TOOL_CALL] } },
	{ name: "non-object body", body: ["prompt"] },
	{ name: "non-array toolCalls", body: { prompt: "x", toolCalls: { name: "echo" } } },
	{
		name: "toolCalls item missing toolCallId",
		body: { prompt: "x", toolCalls: [{ name: "echo", input: {} }] },
	},
	{
		name: "toolCalls item missing input",
		body: { prompt: "x", toolCalls: [{ toolCallId: "tc-1", name: "echo" }] },
	},
	{
		name: "toolCalls item extra field",
		body: {
			prompt: "x",
			toolCalls: [{ ...TOOL_CALL, execute: "echo" }],
		},
	},
	{
		name: "tools item extra field",
		body: {
			prompt: "x",
			toolCalls: [TOOL_CALL],
			tools: [
				{
					name: "echo",
					description: "echo",
					inputSchema: { type: "object" },
					handler: "fn",
				},
			],
		},
	},
	{
		name: "unknown top-level field",
		body: { prompt: "x", toolCalls: [TOOL_CALL], extra: 1 },
	},
	{
		name: "unknown context field",
		body: {
			prompt: "x",
			context: { docId: "doc-1", extra: 1 },
			toolCalls: [TOOL_CALL],
		},
	},
	{
		name: "top-level editor",
		body: {
			prompt: "x",
			editor: { apply: 1, internals: 1 },
			toolCalls: [TOOL_CALL],
		},
	},
	{
		name: "context.editor",
		body: {
			prompt: "x",
			context: { editor: { apply: 1, internals: 1 } },
			toolCalls: [TOOL_CALL],
		},
	},
	{
		name: "message extra field",
		body: {
			prompt: "x",
			toolCalls: [TOOL_CALL],
			messages: [{ role: "user", content: "hi", extra: true }],
		},
	},
	{
		name: "text selection extra field",
		body: {
			prompt: "x",
			toolCalls: [TOOL_CALL],
			context: {
				selection: {
					type: "text",
					anchor: { blockId: "b1", offset: 0 },
					focus: { blockId: "b1", offset: 1 },
					isCollapsed: false,
				},
			},
		},
	},
	{
		name: "negative text offset",
		body: {
			prompt: "x",
			toolCalls: [TOOL_CALL],
			context: {
				selection: {
					type: "text",
					anchor: { blockId: "b1", offset: -1 },
					focus: { blockId: "b1", offset: 0 },
				},
			},
		},
	},
	{
		name: "fractional text offset",
		body: {
			prompt: "x",
			toolCalls: [TOOL_CALL],
			context: {
				selection: {
					type: "text",
					anchor: { blockId: "b1", offset: 1.5 },
					focus: { blockId: "b1", offset: 2 },
				},
			},
		},
	},
	{
		name: "protocolVersion 2",
		body: { prompt: "x", toolCalls: [TOOL_CALL], protocolVersion: 2 },
	},
	{
		name: "protocolVersion 0",
		body: { prompt: "x", toolCalls: [TOOL_CALL], protocolVersion: 0 },
	},
	{
		name: "protocolVersion 1.5",
		body: { prompt: "x", toolCalls: [TOOL_CALL], protocolVersion: 1.5 },
	},
	{
		name: "deeply nested toolCall.input",
		body: {
			prompt: "x",
			toolCalls: [
				{
					...TOOL_CALL,
					input: nest(MAX_PEN_STREAM_REQUEST_DEPTH),
				},
			],
		},
	},
	{
		name: "oversized prompt",
		body: {
			prompt: "x".repeat(MAX_PEN_STREAM_REQUEST_BYTES + 1),
			toolCalls: [TOOL_CALL],
		},
	},
	{
		name: "oversized toolCalls array",
		body: {
			prompt: "x",
			toolCalls: Array.from(
				{ length: MAX_PEN_STREAM_REQUEST_ARRAY_ITEMS + 1 },
				(_, i) => ({
					toolCallId: `tc-${i}`,
					name: "echo",
					input: {},
				}),
			),
		},
	},
];

const HOSTILE_JSON: Array<{ name: string; json: string }> = [
	{
		name: "top-level __proto__",
		json: '{"prompt":"x","__proto__":{"admin":true},"toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{}}]}',
	},
	{
		name: "top-level constructor",
		json: '{"prompt":"x","constructor":{"prototype":{}},"toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{}}]}',
	},
	{
		name: "__proto__ inside toolCall.input",
		json: '{"prompt":"x","toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{"__proto__":{"polluted":true}}}]}',
	},
	{
		name: "constructor inside toolCall.input",
		json: '{"prompt":"x","toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{"constructor":{"prototype":{}}}}]}',
	},
	{
		name: "prototype inside context",
		json: '{"prompt":"x","context":{"prototype":{}},"toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{}}]}',
	},
	{ name: "invalid JSON", json: "{not-json" },
];

describe("SSE hostile bodies are 400 before executeTool", () => {
	it.each(HOSTILE_BODIES)("$name", async ({ body }) => {
		await expectRejectedBeforeExecution(body);
	});

	it.each(HOSTILE_JSON)("$name", async ({ json }) => {
		await expectRejectedBeforeExecution(json);
	});

	it("a well-formed body still reaches executeTool", async () => {
		const { status, executeTool, onRequest } = await postBody({
			prompt: "x",
			toolCalls: [TOOL_CALL],
		});
		expect(status).toBe(200);
		expect(onRequest).toHaveBeenCalledTimes(1);
		expect(executeTool).toHaveBeenCalledTimes(1);
		expect(executeTool).toHaveBeenCalledWith(
			"echo",
			{},
			expect.anything(),
		);
	});
});

describe("parsePenStreamRequest hostile shapes", () => {
	it("rejects prototype keys that JSON.parse materializes as own properties", () => {
		expect(
			parseFromJson(
				'{"prompt":"x","toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{"__proto__":{"x":1}}}]}',
			),
		).toBeNull();
		expect(
			parseFromJson(
				'{"prompt":"x","toolCalls":[{"toolCallId":"tc-1","name":"echo","input":{"constructor":{"x":1}}}]}',
			),
		).toBeNull();
	});

	it("rejects a nest deeper than MAX_PEN_STREAM_REQUEST_DEPTH and accepts the bound", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x",
				toolCalls: [
					{
						...TOOL_CALL,
						input: nest(MAX_PEN_STREAM_REQUEST_DEPTH - 3),
					},
				],
			}),
		).not.toBeNull();
		expect(
			parsePenStreamRequest({
				prompt: "x",
				toolCalls: [
					{
						...TOOL_CALL,
						input: nest(MAX_PEN_STREAM_REQUEST_DEPTH),
					},
				],
			}),
		).toBeNull();
	});

	it("rejects a prompt longer than MAX_PEN_STREAM_REQUEST_BYTES", () => {
		expect(
			parsePenStreamRequest({
				prompt: "x".repeat(MAX_PEN_STREAM_REQUEST_BYTES + 1),
			}),
		).toBeNull();
	});
});
