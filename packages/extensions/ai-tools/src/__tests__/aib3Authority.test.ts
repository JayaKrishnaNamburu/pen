import { describe, expect, it } from "vitest";
import type { DocumentOp, Editor, ToolDefinition } from "@input/pen-types";
import {
	AI_TOOL_UNCONFIRMED_CODE,
	AIToolContextImpl,
	AIToolRuntimeImpl,
	authorizeAIToolCall,
	createAIToolTurn,
	executeAITool,
	isAIToolCallDenied,
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
	const diagnostics: Array<{ code: string; message: string }> = [];
	const editor = {
		apply(ops: DocumentOp[]) {
			applied.push(...ops);
		},
		internals: {
			getSlot() {
				return undefined;
			},
			emit(_event: string, diagnostic: { code: string; message: string }) {
				diagnostics.push(diagnostic);
			},
		},
	} as unknown as Editor;
	return { editor, applied, diagnostics };
}

function mutatingTool(name: string, opCount = 1): ToolDefinition {
	return {
		name,
		description: `${name} mutates the document`,
		inputSchema: { type: "object", properties: {} },
		handler: async (_input, context) => {
			context.editor.apply(
				Array.from({ length: opCount }, (_, index) =>
					insertOp(`${name}-${index}`),
				),
			);
			return { ok: true, name };
		},
	};
}

function readOnlyTool(name: string): ToolDefinition {
	return {
		name,
		description: `${name} reads the document`,
		inputSchema: { type: "object", properties: {} },
		handler: async () => ({ ok: true, name }),
	};
}

describe("AIB3 leftover authority", () => {
	it("AIB3: default-deny mutating", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(readOnlyTool("read_document"));
		runtime.registerTool(mutatingTool("insert_block"));
		runtime.registerTool(mutatingTool("host_rewrite"));

		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn();

		const denied = await authorizeAIToolCall(
			"insert_block",
			{},
			runtime.getTool("insert_block"),
			turn.grant,
		);
		expect(denied).toEqual({
			allowed: false,
			mutating: true,
			destructive: false,
			reason: "tool-not-allowed",
		});

		const unknownDenied = await executeAITool(
			runtime,
			"host_rewrite",
			{},
			context,
			turn,
		);
		expect(isAIToolCallDenied(unknownDenied)).toBe(true);
		if (isAIToolCallDenied(unknownDenied)) {
			expect(unknownDenied).toEqual({
				ok: false,
				status: "blocked",
				reason: "tool-not-allowed",
			});
		}

		const read = await executeAITool(
			runtime,
			"read_document",
			{},
			context,
			turn,
		);
		expect(read).toEqual({ ok: true, name: "read_document" });
		expect(applied).toEqual([]);
		expect(
			listAITools(runtime, turn.grant).map((tool) => tool.name),
		).toEqual(["read_document"]);
	});

	it("AIB3: budget", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(mutatingTool("insert_block", 3));
		const { editor, applied } = createRecordingEditor();
		const context = new AIToolContextImpl(editor, "doc-1", () => {});
		const turn = createAIToolTurn({
			allowedMutatingTools: ["insert_block"],
			budget: {
				maxCallsPerTurn: 2,
				maxOpsPerCall: 8,
				maxTotalOpsPerTurn: 4,
			},
		});

		const first = await executeAITool(
			runtime,
			"insert_block",
			{},
			context,
			turn,
		);
		expect(first).toEqual({ ok: true, name: "insert_block" });
		expect(applied).toHaveLength(3);
		expect(turn.ended).toBe(false);

		const second = await executeAITool(
			runtime,
			"insert_block",
			{},
			context,
			turn,
		);
		expect(second).toEqual({ ok: true, name: "insert_block" });
		expect(applied).toHaveLength(4);
		expect(turn.ended).toBe(true);
		expect(turn.reason).toBe("budget-total-ops-exhausted");

		await expect(
			executeAITool(runtime, "insert_block", {}, context, turn),
		).resolves.toEqual({
			ok: false,
			status: "turn-ended",
			reason: "budget-total-ops-exhausted",
		});
		expect(applied).toHaveLength(4);
	});

	it("AIB3: unconfirmed destructive", async () => {
		const runtime = new AIToolRuntimeImpl();
		runtime.registerTool(mutatingTool("write_document"));
		runtime.registerTool(mutatingTool("delete_block"));

		const unconfirmed = createRecordingEditor();
		const unconfirmedContext = new AIToolContextImpl(
			unconfirmed.editor,
			"doc-1",
			() => {},
		);
		const unconfirmedTurn = createAIToolTurn({
			allowedMutatingTools: ["write_document"],
		});

		const result = await executeAITool(
			runtime,
			"write_document",
			{},
			unconfirmedContext,
			unconfirmedTurn,
		);

		expect(result).toEqual({ ok: true, name: "write_document" });
		expect(unconfirmed.applied).toHaveLength(1);
		expect(unconfirmed.diagnostics).toEqual([
			expect.objectContaining({
				code: AI_TOOL_UNCONFIRMED_CODE,
				message:
					'Destructive tool "write_document" ran without a confirmation resolver.',
			}),
		]);

		const deferred = createRecordingEditor();
		const deferredContext = new AIToolContextImpl(
			deferred.editor,
			"doc-1",
			() => {},
		);
		const deferredTurn = createAIToolTurn({
			allowedMutatingTools: ["delete_block"],
			confirm: () => "defer",
		});

		const deferredResult = await executeAITool(
			runtime,
			"delete_block",
			{},
			deferredContext,
			deferredTurn,
		);
		expect(isAIToolCallDenied(deferredResult)).toBe(true);
		if (isAIToolCallDenied(deferredResult)) {
			expect(deferredResult).toEqual({
				ok: false,
				status: "blocked",
				reason: "tool-confirmation-deferred",
			});
		}
		expect(deferred.applied).toEqual([]);
		expect(deferred.diagnostics).toEqual([]);
	});
});
