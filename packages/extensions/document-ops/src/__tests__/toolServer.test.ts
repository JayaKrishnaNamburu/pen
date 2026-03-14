import { describe, expect, it } from "vitest";

import { DOCUMENT_OPS_TOOL_RUNTIME_SLOT } from "../constants/toolServer";
import { documentOpsExtension } from "../documentOpsExtension";
import { ToolRuntimeImpl } from "../toolServer";
import { getDocumentToolRuntime } from "../utils/toolServer";

describe("@pen/document-ops ToolRuntimeImpl", () => {
	it("throws for unknown tools", async () => {
		const runtime = new ToolRuntimeImpl();

		await expect(
			runtime.executeTool(
				"missing_tool",
				{},
				{} as never,
			),
		).rejects.toThrow('Unknown tool: "missing_tool"');
	});

	it("validates required input fields", async () => {
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool({
			name: "echo",
			description: "Echo input",
			inputSchema: {
				type: "object",
				required: ["value"],
				properties: {
					value: { type: "string" },
				},
			},
			handler: async (input) => input,
		});

		await expect(
			runtime.executeTool("echo", {}, {} as never),
		).rejects.toThrow('Missing required field: "value"');
	});

	it("validates nested object and array payloads", async () => {
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool({
			name: "write",
			description: "Validate nested payloads",
			inputSchema: {
				type: "object",
				required: ["range", "steps"],
				properties: {
					range: {
						type: "object",
						required: ["startBlockId"],
						properties: {
							startBlockId: { type: "string" },
							endBlockId: { type: "string" },
						},
					},
					steps: {
						type: "array",
						items: {
							type: "object",
							required: ["op"],
							properties: {
								op: { type: "string" },
								count: { type: "number" },
							},
						},
					},
				},
			},
			handler: async (input) => input,
		});

		await expect(
			runtime.executeTool(
				"write",
				{
					range: { startBlockId: 42 },
					steps: [{ op: "replace" }, { count: "two" }],
				},
				{} as never,
			),
		).rejects.toThrow(
			'Field "range.startBlockId" must be a string, got number; Missing required field: "steps[1].op"; Field "steps[1].count" must be a number, got string',
		);
	});

	it("supports anyOf branches and numeric/string bounds", async () => {
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool({
			name: "move",
			description: "Validate alternative position shapes",
			inputSchema: {
				type: "object",
				required: ["position", "query"],
				properties: {
					position: {
						anyOf: [
							{
								type: "string",
								enum: ["first", "last"],
							},
							{
								type: "object",
								required: ["after"],
								properties: {
									after: {
										type: "string",
										minLength: 1,
									},
								},
							},
						],
					},
					query: {
						type: "string",
						minLength: 1,
					},
					maxResults: {
						type: "number",
						minimum: 1,
						maximum: 5,
					},
				},
			},
			handler: async (input) => input,
		});

		await expect(
			runtime.executeTool(
				"move",
				{
					position: {
						after: "",
					},
					query: "",
					maxResults: 7,
				},
				{} as never,
			),
		).rejects.toThrow(
			'Field "position" must match one of the allowed schemas; Field "query" must be at least 1 characters long; Field "maxResults" must be at most 5',
		);
	});

	it("rejects unknown object fields by default", async () => {
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool({
			name: "echo",
			description: "Echo input",
			inputSchema: {
				type: "object",
				properties: {
					value: { type: "string" },
				},
			},
			handler: async (input) => input,
		});

		await expect(
			runtime.executeTool(
				"echo",
				{
					value: "ok",
					extra: true,
				},
				{} as never,
			),
		).rejects.toThrow('Unknown field: "extra"');
	});

	it("resolves the registered document tool runtime from editor slots", () => {
		const runtime = new ToolRuntimeImpl();
		const editor = {
			internals: {
				getSlot<T>(key: string): T | undefined {
					return key === DOCUMENT_OPS_TOOL_RUNTIME_SLOT
						? (runtime as T)
						: undefined;
				},
			},
		} as never;

		expect(getDocumentToolRuntime(editor)).toBe(runtime);
	});

	it("returns null when the document tool runtime is unavailable", () => {
		const editor = {
			internals: {
				getSlot(): undefined {
					return undefined;
				},
			},
		} as never;

		expect(getDocumentToolRuntime(editor)).toBeNull();
	});

	it("clears the registered runtime slot on extension deactivation", async () => {
		const slots = new Map<string, unknown>();
		const editor = {
			internals: {
				getSlot<T>(key: string): T | undefined {
					return slots.get(key) as T | undefined;
				},
				setSlot(key: string, value: unknown): void {
					slots.set(key, value);
				},
			},
			schema: {
				resolve: () => null,
			},
		} as never;
		const extension = documentOpsExtension();

		await extension.activateClient?.({
			editor,
			emit() {},
			getState() {
				return undefined;
			},
		});

		expect(getDocumentToolRuntime(editor)).toBeTruthy();

		await extension.deactivateClient?.();

		expect(getDocumentToolRuntime(editor)).toBeNull();
		expect(slots.get(DOCUMENT_OPS_TOOL_RUNTIME_SLOT)).toBeUndefined();
	});
});
