// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { FieldEditorImpl } from "../fieldEditorImpl";

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
	fieldEditor: FieldEditorImpl;
}> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		fixture.fieldEditor.destroy();
		fixture.editor.destroy();
	}
});

describe("enter-split leftover-ignore via authority.record", () => {
	it("survives the session switch onto the new block without peek/restore", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		fixtures.push({ editor, fieldEditor });

		const firstBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "Hello",
			},
			{
				type: "insert-block",
				blockId: "inserted",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectText(firstBlockId, 5, 5);
		fieldEditor.activate(firstBlockId);
		expect(fieldEditor.focusBlockId).toBe(firstBlockId);

		fieldEditor.commitProgrammaticTextSelection("inserted", 0, 0);

		expect(fieldEditor.focusBlockId).toBe("inserted");
		expect(
			fieldEditor.shouldIgnoreDomTextSelection(
				{ blockId: firstBlockId, offset: 5 },
				{ blockId: firstBlockId, offset: 5 },
			),
		).toBe(true);
	});

	it("resolveProgrammaticInputRange reads the record caret while the live range is stale", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		fixtures.push({ editor, fieldEditor });

		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello world" },
		]);
		editor.selectText(blockId, 3, 3);
		fieldEditor.activate(blockId);
		fieldEditor.commitProgrammaticTextSelection(blockId, 3, 3);

		expect(
			fieldEditor.resolveProgrammaticInputRange(blockId, {
				start: 11,
				end: 11,
			}),
		).toEqual({ start: 3, end: 3 });
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello world");
	});
});
