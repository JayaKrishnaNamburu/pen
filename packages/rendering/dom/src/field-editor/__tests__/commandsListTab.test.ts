import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { applyListTabBehavior } from "../commandsListTab";
import type { FieldEditorTextLike } from "../crdt";

type BlocksMapLike = {
	get(key: string): { get(field: string): unknown } | undefined;
};

type RawDocLike = {
	getMap(name: string): BlocksMapLike;
};

function getYText(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): FieldEditorTextLike {
	const adapter = editor.internals.adapter;
	const doc = editor.internals.crdtDoc;
	const ydoc = adapter.raw<RawDocLike>(doc);
	const ytext = ydoc
		.getMap("blocks")
		.get(blockId)
		?.get("content") as FieldEditorTextLike | null;
	if (!ytext) {
		throw new Error(`Missing test Y.Text for block ${blockId}`);
	}
	return ytext;
}

describe("applyListTabBehavior", () => {
	it("Tab indents a list item when the previous sibling can own the nesting", () => {
		const editor = createEditor({ schema: defaultSchema });
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "set-props",
				blockId: firstBlockId,
				props: { type: "bulletListItem" },
			},
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "bulletListItem",
				props: { indent: 0 },
				position: { after: firstBlockId },
			},
			{
				type: "splice-text",
				blockId: secondBlockId,
				from: 0,
				to: 0,
				insert: "child",
			},
		]);

		const target = applyListTabBehavior(editor, {
			blockId: secondBlockId,
			ytext: getYText(editor, secondBlockId),
			range: { start: 2, end: 2 },
			shiftKey: false,
		});

		expect(target).toEqual({
			blockId: secondBlockId,
			anchorOffset: 2,
			focusOffset: 2,
		});
		expect(editor.getBlock(secondBlockId)?.props.indent).toBe(1);
		editor.destroy();
	});
});
