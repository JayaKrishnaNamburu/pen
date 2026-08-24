import type { ApplyOptions, DocumentOp, Editor } from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";

import {
	DOCUMENT_OP_TYPES,
	INVALID_TOOL_PAYLOAD_CODE,
	isDocumentOpType,
	MAX_OP_TEXT_FIELD_LENGTH,
} from "../constants/payloadValidation";
import { updateBlockTool } from "../tools/updateBlock";
import {
	applyValidatedOps,
	validateToolPayloads,
} from "../utils/payloadValidation";
import { defaultSchema } from "./fixtures/testSchema";

const SPEC_PRIMITIVE_TYPES = [
	"app",
	"delete-block",
	"format-text",
	"grid",
	"insert-block",
	"move-block",
	"set-meta",
	"set-props",
	"splice-text",
	"stream-open",
] as const;

const DELETED_V2_TYPES = [
	"insert-text",
	"delete-text",
	"replace-text",
	"insert-inline-node",
	"remove-inline-node",
	"insert-table-cell-text",
	"delete-table-cell-text",
	"format-table-cell-text",
	"update-block",
	"convert-block",
	"update-layout",
	"update-table-columns",
	"insert-table-row",
	"create-app",
	"split-block",
	"merge-blocks",
	"set-selection",
] as const;

function createEditor(blockIds: readonly string[] = ["paragraph-1"]): Editor {
	return {
		documentProfile: "structured",
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		getBlock: (blockId: string) =>
			blockIds.includes(blockId)
				? ({
						id: blockId,
						type: "paragraph",
						length: () => 0,
					} as ReturnType<Editor["getBlock"]>)
				: null,
		internals: {
			emit: vi.fn(),
		},
	} as unknown as Editor;
}

function knownToolType(type: DocumentOp["type"]): boolean {
	switch (type) {
		case "stream-open":
			return false;
		case "splice-text":
		case "format-text":
		case "insert-block":
		case "delete-block":
		case "move-block":
		case "set-props":
		case "set-meta":
		case "grid":
		case "app":
			return true;
		default: {
			const _exhaustive: never = type;
			return _exhaustive;
		}
	}
}

describe("ops op-boundary OPB3", () => {
	it("OPB3: DOCUMENT_OP_TYPE_FLAGS is a ten-key Record over DocumentOp type", () => {
		expect([...DOCUMENT_OP_TYPES].sort()).toEqual([...SPEC_PRIMITIVE_TYPES]);
		expect(DOCUMENT_OP_TYPES).toHaveLength(10);
		for (const type of DOCUMENT_OP_TYPES) {
			expect(isDocumentOpType(type)).toBe(true);
			void knownToolType(type);
		}
	});

	it("OPB3: tool payload validator re-keys to primitives and rejects deleted v2 types", () => {
		const editor = createEditor();
		const accepted: DocumentOp[] = [
			{
				type: "splice-text",
				blockId: "paragraph-1",
				from: 0,
				to: 0,
				insert: "hi",
			},
			{
				type: "format-text",
				blockId: "paragraph-1",
				from: 0,
				to: 0,
				marks: { bold: true },
			},
			{
				type: "insert-block",
				blockId: "new-1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "delete-block", blockId: "paragraph-1" },
			{ type: "move-block", blockId: "paragraph-1", position: "last" },
			{ type: "set-props", blockId: "paragraph-1", props: { type: "paragraph" } },
			{
				type: "set-meta",
				blockId: "paragraph-1",
				namespace: "note",
				data: { a: 1 },
			},
			{
				type: "grid",
				blockId: "paragraph-1",
				change: { kind: "insert-row", index: 0 },
			},
			{
				type: "app",
				change: { kind: "delete", appId: "app-1" },
			},
		];

		const acceptedResult = validateToolPayloads(editor, accepted);
		expect(acceptedResult.ok).toBe(true);
		expect(acceptedResult.ops.map((op) => op.type).sort()).toEqual(
			accepted.map((op) => op.type).sort(),
		);

		const rejectedNames: string[] = [];
		for (const type of DELETED_V2_TYPES) {
			expect(isDocumentOpType(type)).toBe(false);
			const result = validateToolPayloads(editor, [
				{ type, blockId: "paragraph-1" },
			]);
			expect(result.ok).toBe(false);
			expect(result.failures[0]?.message).toBe(
				`Unknown DocumentOp type: "${type}"`,
			);
			rejectedNames.push(type);
		}
		expect(rejectedNames).toEqual([...DELETED_V2_TYPES]);
	});

	it("OPB3: stream-open stays known but is not a tool-applicable DocumentOp", () => {
		expect(isDocumentOpType("stream-open")).toBe(true);
		const editor = createEditor();
		expect(() =>
			applyValidatedOps(editor, [
				{ type: "stream-open", blockId: "paragraph-1" },
			]),
		).toThrow("Invalid tool payload");
		expect(editor.apply).not.toHaveBeenCalled();
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				message: "stream-open is not a tool-applicable DocumentOp",
			}),
		);
	});

	it("OPB3: proto-key walk and 1MB cap apply to splice-text payloads", () => {
		const editor = createEditor();
		const props: Record<string, unknown> = { id: "1", label: "Ada" };
		Object.defineProperty(props, "__proto__", {
			value: { polluted: true },
			enumerable: true,
			configurable: true,
			writable: true,
		});

		expect(() =>
			applyValidatedOps(editor, [
				{
					type: "splice-text",
					blockId: "paragraph-1",
					from: 0,
					to: 0,
					insert: { nodeType: "mention", props },
				},
			]),
		).toThrow("Invalid tool payload");
		expect(editor.apply).not.toHaveBeenCalled();
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				message: "Prototype keys are not allowed: __proto__",
			}),
		);

		expect(() =>
			applyValidatedOps(editor, [
				{
					type: "splice-text",
					blockId: "paragraph-1",
					from: 0,
					to: 0,
					insert: "x".repeat(MAX_OP_TEXT_FIELD_LENGTH + 1),
				},
			]),
		).toThrow("Invalid tool payload");
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				message: `Op text field exceeds MAX_OP_TEXT_FIELD_LENGTH (${MAX_OP_TEXT_FIELD_LENGTH})`,
			}),
		);
	});

	it("OPB3: tool authority remaps update_block onto set-props", async () => {
		const editor = createEditor();
		await updateBlockTool(editor).handler(
			{
				blockId: "paragraph-1",
				props: { type: "paragraph" },
			},
			{} as never,
		);
		expect(editor.apply).toHaveBeenCalledTimes(1);
		expect(vi.mocked(editor.apply).mock.calls[0]?.[0]).toEqual([
			{
				type: "set-props",
				blockId: "paragraph-1",
				props: { type: "paragraph" },
			},
		]);
	});
});
