import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { resolveSelectionPreviewTarget } from "../controller/streamingPreviewInput";

describe("resolveSelectionPreviewTarget", () => {
	it("names a same-block rewrite as a text-range", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
		]);

		expect(
			resolveSelectionPreviewTarget(editor, {
				start: { blockId, offset: 0 },
				end: { blockId, offset: 5 },
			}),
		).toEqual({
			kind: "text-range",
			blockId,
			from: 0,
			to: 5,
		});
		editor.destroy();
	});

	it("names a cross-block rewrite as a block-range", () => {
		const editor = createEditor({ schema: defaultSchema });
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
			{
				type: "splice-text",
				blockId: "b2",
				from: 0,
				to: 0,
				insert: "World",
			},
		]);

		expect(
			resolveSelectionPreviewTarget(editor, {
				start: { blockId: firstBlockId, offset: 2 },
				end: { blockId: "b2", offset: 3 },
			}),
		).toEqual({
			kind: "block-range",
			start: { blockId: firstBlockId, offset: 2 },
			end: { blockId: "b2", offset: 3 },
			blockIds: [firstBlockId, "b2"],
		});
		editor.destroy();
	});

	it("returns null when a cross-block endpoint is missing from blockOrder", () => {
		const editor = createEditor({ schema: defaultSchema });
		const firstBlockId = editor.firstBlock()!.id;

		expect(
			resolveSelectionPreviewTarget(editor, {
				start: { blockId: firstBlockId, offset: 0 },
				end: { blockId: "missing", offset: 3 },
			}),
		).toBeNull();
		editor.destroy();
	});
});
