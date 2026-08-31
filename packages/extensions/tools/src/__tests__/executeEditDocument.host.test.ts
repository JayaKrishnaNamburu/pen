import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { ApplyOptions, DocumentOp, Editor } from "@input/pen-types";
import {
	EDIT_DOCUMENT_OPERATIONS,
	editDocumentTool,
	executeEditDocument,
	getDocumentToolRuntime,
	planEditDocument,
	toolsExtension,
} from "../index";

const REPLACE_CLOSING = {
	operations: [
		{
			operation: "replace_block_text",
			blockId: "closing",
			text: "Host rewrite.",
		},
	],
};

let editor: Editor;

async function seed(): Promise<void> {
	editor = createEditor({
		schema: defaultSchema,
		extensions: [toolsExtension()],
	});
	await editor.whenReady();

	const headingId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "set-props",
				blockId: headingId,
				props: { type: "heading", level: 1 },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: "Quarterly Report",
			},
			{
				type: "insert-block",
				blockId: "closing",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "closing",
				from: 0,
				to: 0,
				insert: "Revenue grew.",
			},
		],
		{ origin: "system" },
	);
}

describe("executeEditDocument (EC21)", () => {
	beforeEach(async () => {
		await seed();
	});

	it("EC4: EDIT_DOCUMENT_OPERATIONS is the closed set advertised by the tool schema", () => {
		const tool = getDocumentToolRuntime(editor)!.getTool("edit_document")!;
		const schema = tool.inputSchema as {
			properties?: {
				operations?: {
					items?: {
						properties?: { operation?: { enum?: string[] } };
					};
				};
			};
		};
		expect(
			schema.properties?.operations?.items?.properties?.operation?.enum,
		).toEqual([...EDIT_DOCUMENT_OPERATIONS]);
	});

	it("planEditDocument compiles ops without applying", () => {
		const before = editor.getBlock("closing")!.textContent();
		const plan = planEditDocument(editor, REPLACE_CLOSING);
		expect(plan.rejected).toEqual([]);
		expect(plan.compiledOperations).toEqual(["replace_block_text"]);
		expect(plan.compiled).toEqual([
			{
				index: 0,
				operation: "replace_block_text",
				op: plan.ops[0],
			},
		]);
		expect(plan.ops).toEqual([
			{
				type: "splice-text",
				blockId: "closing",
				from: 0,
				to: before.length,
				insert: "Host rewrite.",
			},
		]);
		expect(editor.getBlock("closing")?.textContent()).toBe(before);
	});

	it("the registered tool and executeEditDocument apply the same ops with origin ai", async () => {
		const direct = executeEditDocument(editor, REPLACE_CLOSING);
		expect(direct.ok).toBe(true);
		expect(editor.getBlock("closing")?.textContent()).toBe("Host rewrite.");

		await seed();
		const viaTool = (await getDocumentToolRuntime(editor)!.executeTool(
			"edit_document",
			REPLACE_CLOSING,
			{} as never,
		)) as { ok: boolean; appliedOperations: string[] };
		expect(viaTool).toEqual(direct);
		expect(editor.getBlock("closing")?.textContent()).toBe("Host rewrite.");
	});

	it("editDocumentTool with a custom apply/origin is the same compiler as the built-in tool", async () => {
		const applied: Array<{ ops: DocumentOp[]; options: ApplyOptions }> = [];
		const hostTool = editDocumentTool(editor, {
			origin: { type: "ai", groupId: "host-edit" },
			apply: (ops, applyOptions) => {
				applied.push({ ops, options: applyOptions });
				editor.apply(ops, applyOptions);
			},
		});

		const result = (await hostTool.handler(
			REPLACE_CLOSING,
			{} as never,
		)) as {
			ok: boolean;
			appliedOperations: string[];
		};
		expect(result.ok).toBe(true);
		expect(applied).toHaveLength(1);
		expect(applied[0]?.options.origin).toEqual({
			type: "ai",
			groupId: "host-edit",
		});
		expect(applied[0]?.ops[0]).toMatchObject({
			type: "splice-text",
			blockId: "closing",
			insert: "Host rewrite.",
		});
		expect(editor.getBlock("closing")?.textContent()).toBe("Host rewrite.");
	});

	it("executeEditDocument injects origin and apply without bypassing editor.apply", () => {
		const applySpy = vi.spyOn(editor, "apply");
		const result = executeEditDocument(editor, REPLACE_CLOSING, {
			origin: { type: "ai", groupId: "host-run" },
			apply: (ops, applyOptions) => {
				editor.apply(ops, applyOptions);
			},
		});

		expect(result.ok).toBe(true);
		expect(applySpy).toHaveBeenCalledTimes(1);
		expect(applySpy.mock.calls[0]?.[1]).toEqual({
			origin: { type: "ai", groupId: "host-run" },
		});
		expect(editor.getBlock("closing")?.textContent()).toBe("Host rewrite.");
		applySpy.mockRestore();
	});

	it("EC5: a host apply path still returns the live outline for a refused target", () => {
		const apply = vi.fn();
		const result = executeEditDocument(
			editor,
			{
				operations: [
					{
						operation: "replace_block_text",
						blockId: "missing",
						text: "nope",
					},
				],
			},
			{ apply },
		);
		expect(apply).not.toHaveBeenCalled();
		expect(result.ok).toBe(false);
		expect(result.rejected?.[0]?.reason).toMatch(/unknown-block/);
		expect(
			result.outline?.some((entry) => entry.blockId === "closing"),
		).toBe(true);
	});

	it("EC5: an onBeforeApply hook that drops a planned mutation is not reported as applied", () => {
		const before = editor.getBlock("closing")!.textContent();
		const unsubscribe = editor.onBeforeApply((ops) =>
			ops.filter((op) => op.type !== "splice-text"),
		);

		const result = executeEditDocument(editor, REPLACE_CLOSING);

		unsubscribe();
		expect(result.ok).toBe(false);
		expect(result.appliedOperations).toEqual([]);
		expect(result.rejected?.[0]).toMatchObject({
			index: 0,
			operation: "replace_block_text",
			reason: expect.stringMatching(/dropped-apply/),
		});
		expect(editor.getBlock("closing")?.textContent()).toBe(before);
	});

	it("EC5: dropping one of two identical compiled ops does not mark the other applied", () => {
		const before = editor.getBlock("closing")!.textContent();
		const unsubscribe = editor.onBeforeApply((ops) =>
			ops.filter((_, index) => index === 0),
		);

		const result = executeEditDocument(editor, {
			operations: [
				{
					operation: "replace_block_text",
					blockId: "closing",
					text: "Same rewrite.",
				},
				{
					operation: "replace_block_text",
					blockId: "closing",
					text: "Same rewrite.",
				},
			],
		});

		unsubscribe();
		expect(result.ok).toBe(false);
		expect(result.appliedOperations).toEqual(["replace_block_text"]);
		expect(result.rejected).toEqual([
			{
				index: 1,
				operation: "replace_block_text",
				reason: expect.stringMatching(/dropped-apply/),
			},
		]);
		expect(editor.getBlock("closing")?.textContent()).toBe("Same rewrite.");
		expect(before).not.toBe("Same rewrite.");
	});

	it("EC21: a set-props rewrite from core prop validation still counts as applied", () => {
		const headingId = editor.firstBlock()!.id;
		const result = executeEditDocument(editor, {
			operations: [
				{
					operation: "set_block_props",
					blockId: headingId,
					props: { level: "2" },
				},
			],
		});

		expect(result).toEqual({
			ok: true,
			appliedOperations: ["set_block_props"],
		});
		expect(editor.getBlock(headingId)?.props.level).toBe(2);
		expect(editor.getBlock(headingId)?.type).toBe("heading");
	});
});
