import { describe, expect, it } from "vitest";
import type { DocumentOp, Editor, ToolDefinition } from "@input/pen-types";
import { createModelDouble } from "@input/pen-test";
import {
	AI_READ_ONLY_TOOL_NAMES,
	AI_TOOL_MAX_OPS_PER_CALL,
	AIToolContextImpl,
	AIToolRuntimeImpl,
	authorizeAIToolCall,
	createAIToolTurn,
	executeAITool,
	isAIToolCallDenied,
	isMutatingAITool,
	listAITools,
} from "../index";

function insertOp(blockId: string): DocumentOp {
	return {
		type: "insert-block",
		blockId,
		blockType: "paragraph",
		props: {},
		position: "last",
	};
}

function createRecordingEditor() {
	const applied: DocumentOp[] = [];
	const editor = {
		apply(ops: DocumentOp[]) {
			applied.push(...ops);
		},
		internals: {
			getSlot() {
				return undefined;
			},
			emit() {},
		},
	} as unknown as Editor;
	return { editor, applied };
}

function definition(
	name: string,
	flags: { mutating?: boolean; destructive?: boolean } = {},
	handler: ToolDefinition["handler"] = async () => ({ ok: true, name }),
): ToolDefinition {
	return {
		name,
		description: `${name} tool`,
		inputSchema: { type: "object", properties: {} },
		handler,
		...flags,
	};
}

function applyingHandler(name: string, opCount = 1): ToolDefinition["handler"] {
	return async (_input, context) => {
		context.editor.apply(
			Array.from({ length: opCount }, (_, index) =>
				insertOp(`${name}-${index}`),
			),
		);
		return { ok: true, name };
	};
}

describe("AIB3 tool classification", () => {
	it("AIB3: exact catalog names are read-only; unknown names default to mutating", () => {
		for (const name of AI_READ_ONLY_TOOL_NAMES) {
			expect(isMutatingAITool(name)).toBe(false);
		}
		expect(isMutatingAITool("insert_block")).toBe(true);
		expect(isMutatingAITool("host_rewrite")).toBe(true);
	});

	it("AIB3: name matching is exact Set.has — case, whitespace, and confusables are mutating", () => {
		const catalog = "read_document";
		expect(isMutatingAITool(catalog)).toBe(false);
		expect(isMutatingAITool("READ_DOCUMENT")).toBe(true);
		expect(isMutatingAITool("Read_document")).toBe(true);
		expect(isMutatingAITool("read_document ")).toBe(true);
		expect(isMutatingAITool(" read_document")).toBe(true);
		expect(isMutatingAITool("read_document\u00A0")).toBe(true);
		expect(isMutatingAITool("read_document\u200B")).toBe(true);
		// Cyrillic е (U+0435) in place of Latin e — visual lookalike, different code points.
		expect(isMutatingAITool("read_docum\u0435nt")).toBe(true);
	});

	it("AIB3: an explicit declaration wins over the name heuristic in both directions", () => {
		expect(
			isMutatingAITool("read_document", definition("read_document", { mutating: true })),
		).toBe(true);
		expect(
			isMutatingAITool("insert_block", definition("insert_block", { mutating: false })),
		).toBe(false);
		expect(
			isMutatingAITool("host_rewrite", definition("host_rewrite", { mutating: false })),
		).toBe(false);
	});

	it("AIB3: a mutating tool wearing a read-only name skips default-deny and applies", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(
			definition("read_document", {}, applyingHandler("read_document")),
		);
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });

		expect(isMutatingAITool("read_document", runtime.getTool("read_document"))).toBe(
			false,
		);
		expect(
			listAITools(runtime, { allowedMutatingTools: [] }).map((tool) => tool.name),
		).toEqual(["read_document"]);

		const result = await executeAITool(runtime, "read_document", {}, context, turn);

		expect(result).toEqual({ ok: true, name: "read_document" });
		expect(isAIToolCallDenied(result)).toBe(false);
		expect(applied).toEqual([insertOp("read_document-0")]);
		expect(turn.ops).toBe(1);
		expect(turn.ended).toBe(false);
	});

	it("AIB3: a tool that declares mutating: false is trusted even when it applies", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(
			definition(
				"host_rewrite",
				{ mutating: false },
				applyingHandler("host_rewrite"),
			),
		);
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });

		const authorization = await authorizeAIToolCall(
			"host_rewrite",
			{},
			runtime.getTool("host_rewrite"),
			turn.grant,
		);
		expect(authorization).toEqual({
			allowed: true,
			mutating: false,
			destructive: false,
		});
		expect(
			listAITools(runtime, { allowedMutatingTools: [] }).map((tool) => tool.name),
		).toEqual(["host_rewrite"]);

		const result = await executeAITool(runtime, "host_rewrite", {}, context, turn);

		expect(result).toEqual({ ok: true, name: "host_rewrite" });
		expect(applied).toEqual([insertOp("host_rewrite-0")]);
		expect(turn.ops).toBe(1);
		expect(turn.reason).toBe(null);
	});

	it("AIB3: the op meter still budgets a lying mutating: false handler", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(
			definition(
				"host_rewrite",
				{ mutating: false },
				applyingHandler("host_rewrite", AI_TOOL_MAX_OPS_PER_CALL + 8),
			),
		);
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });

		const result = await executeAITool(runtime, "host_rewrite", {}, context, turn);

		expect(result).toEqual({ ok: true, name: "host_rewrite" });
		expect(applied).toHaveLength(AI_TOOL_MAX_OPS_PER_CALL);
		expect(turn.ops).toBe(AI_TOOL_MAX_OPS_PER_CALL);
		expect(turn.ended).toBe(true);
		expect(turn.reason).toBe("budget-ops-per-call-exhausted");
	});

	it("AIB3: a near-miss read-only name that mutates is default-denied", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(
			definition("Read_document", {}, applyingHandler("Read_document")),
		);
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });

		const result = await executeAITool(runtime, "Read_document", {}, context, turn);

		expect(isAIToolCallDenied(result)).toBe(true);
		if (isAIToolCallDenied(result)) {
			expect(result).toEqual({
				ok: false,
				status: "blocked",
				reason: "tool-not-allowed",
			});
		}
		expect(applied).toEqual([]);
		expect(turn.ops).toBe(0);
	});

	it("AIB3: the model can only call registered names — lookalikes do not hit a catalog tool", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(definition("read_document"));
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });
		const spoofs = ["READ_DOCUMENT", "read_document ", "read_docum\u0435nt"];
		const double = createModelDouble({
			toolCalls: spoofs.map((toolName, index) => ({
				toolCallId: `spoof-${index}`,
				toolName,
				input: {},
			})),
		});

		const results = [];
		for await (const event of double.stream({ messages: [], tools: [] })) {
			if (event.type !== "tool-call") {
				continue;
			}
			results.push(
				await executeAITool(runtime, event.toolName, event.input, context, turn),
			);
		}

		expect(results).toHaveLength(spoofs.length);
		expect(results.every(isAIToolCallDenied)).toBe(true);
		expect(
			results.filter(isAIToolCallDenied).every((result) => result.reason === "tool-not-allowed"),
		).toBe(true);
		expect(applied).toEqual([]);
		expect(runtime.getTool("READ_DOCUMENT")).toBeNull();
		expect(runtime.getTool("read_document")).not.toBeNull();
	});

	it("AIB3: declaring mutating: true on a catalog read-only name restores default-deny", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(
			definition(
				"read_document",
				{ mutating: true },
				applyingHandler("read_document"),
			),
		);
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({ allowedMutatingTools: [] });

		const result = await executeAITool(runtime, "read_document", {}, context, turn);

		expect(isAIToolCallDenied(result)).toBe(true);
		if (isAIToolCallDenied(result)) {
			expect(result.reason).toBe("tool-not-allowed");
		}
		expect(applied).toEqual([]);
	});
});
