import { defaultSchema } from "./fixtures/testSchema";
import type { ApplyOptions, DocumentOp, Editor } from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";
import {
	INVALID_TOOL_PAYLOAD_CODE,
	isDocumentOpType,
	MAX_OP_TEXT_FIELD_LENGTH,
} from "../constants/payloadValidation";
import { insertBlockTool } from "../tools/insertBlock";
import { applyValidatedOps } from "../utils/payloadValidation";

function createEditor(blockIds: readonly string[] = []): Editor {
	return {
		documentProfile: "structured",
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		getBlock: (blockId: string) =>
			blockIds.includes(blockId)
				? ({ id: blockId, type: "paragraph" } as ReturnType<
						Editor["getBlock"]
					>)
				: null,
		internals: {
			emit: vi.fn(),
		},
	} as unknown as Editor;
}

describe("SEC6 tool payload validation", () => {
	it("SEC6: invalid tool payload does not apply", () => {
		const editor = createEditor(["paragraph-1"]);

		expect(() =>
			applyValidatedOps(
				editor,
				[
					{
						type: "insert-block",
						blockId: "new-1",
						blockType: "paragraph",
						props: {},
						position: "last",
					},
					{
						type: "not-a-document-op",
						blockId: "paragraph-1",
					},
					{
						type: "set-props",
						blockId: "missing-block",
						props: {},
					},
				],
				{ origin: "ai" },
			),
		).toThrow("Invalid tool payload");

		expect(editor.apply).not.toHaveBeenCalled();
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				level: "error",
				source: "tools",
				message: 'Unknown DocumentOp type: "not-a-document-op"',
			}),
		);
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				message: 'Unresolved target: "missing-block"',
			}),
		);
	});

	it("SEC6: hidden block type does not apply even when mixed with a valid insert", () => {
		const editor = createEditor(["paragraph-1"]);

		expect(() =>
			applyValidatedOps(
				editor,
				[
					{
						type: "insert-block",
						blockId: "ok-1",
						blockType: "paragraph",
						props: {},
						position: "last",
					},
					{
						type: "insert-block",
						blockId: "hidden-1",
						blockType: "subdocument",
						props: {},
						position: "last",
					},
				],
				{ origin: "ai" },
			),
		).toThrow("Invalid tool payload");

		expect(editor.apply).not.toHaveBeenCalled();
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				source: "tools",
				message:
					'Block type "subdocument" is not available in structured documents.',
			}),
		);
	});

	it("SEC6: oversized text rejected", async () => {
		const editor = createEditor();
		const content = "x".repeat(MAX_OP_TEXT_FIELD_LENGTH + 1);

		await expect(
			insertBlockTool(editor).handler(
				{
					position: "last",
					blockType: "paragraph",
					content,
				},
				{} as never,
			),
		).rejects.toThrow("Invalid tool payload");

		expect(editor.apply).not.toHaveBeenCalled();
		expect(editor.internals.emit).toHaveBeenCalledWith(
			"diagnostic",
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				message: `Op text field exceeds MAX_OP_TEXT_FIELD_LENGTH (${MAX_OP_TEXT_FIELD_LENGTH})`,
			}),
		);
	});

	it("ST1: stream-open is a known type but not a tool-applicable op", () => {
		expect(isDocumentOpType("stream-open")).toBe(true);
		const editor = createEditor(["paragraph-1"]);
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

	it("SEC6: proto keys in tool payload do not apply", () => {
		const editor = createEditor();
		const props: Record<string, unknown> = { title: "kept" };
		Object.defineProperty(props, "__proto__", {
			value: { polluted: true },
			enumerable: true,
			configurable: true,
			writable: true,
		});

		expect(() =>
			applyValidatedOps(editor, [
				{
					type: "insert-block",
					blockId: "new-1",
					blockType: "paragraph",
					props,
					position: "last",
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
	});

	it("SEC6: valid payload still applies", async () => {
		const editor = createEditor();

		const result = (await insertBlockTool(editor).handler(
			{
				position: "last",
				blockType: "paragraph",
				content: "Hello",
			},
			{} as never,
		)) as { blockId: string };

		expect(result.blockId).toEqual(expect.any(String));
		expect(editor.apply).toHaveBeenCalledTimes(1);
		expect(vi.mocked(editor.apply).mock.calls[0]?.[0]).toEqual([
			expect.objectContaining({
				type: "insert-block",
				blockId: result.blockId,
				blockType: "paragraph",
				position: "last",
			}),
			expect.objectContaining({
				type: "splice-text",
				blockId: result.blockId,
				insert: "Hello",
			}),
		]);
		expect(editor.internals.emit).not.toHaveBeenCalled();
	});
});
