import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { FieldEditorImpl } from "../fieldEditorImpl";
import { handleSelectAllShortcut } from "../keyHandling";

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

function createSelectAllEvent(): KeyboardEvent {
	let defaultPrevented = false;
	return {
		key: "a",
		ctrlKey: false,
		metaKey: true,
		shiftKey: false,
		altKey: false,
		defaultPrevented,
		preventDefault() {
			defaultPrevented = true;
			Object.defineProperty(this, "defaultPrevented", {
				configurable: true,
				value: true,
			});
		},
	} as KeyboardEvent;
}

describe("handleSelectAllShortcut vs T1 ladder", () => {
	it("T1: Mod-a keystroke stays document-first; editor.selectAll() already runs the ladder", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		fixtures.push({ editor, fieldEditor });

		const firstBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-text",
				blockId: firstBlockId,
				offset: 0,
				text: "hello",
			},
			{
				type: "insert-block",
				blockId: "second",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: "second",
				offset: 0,
				text: "world",
			},
		]);
		editor.selectText(firstBlockId, 2, 2);
		fieldEditor.activate(firstBlockId);

		expect(
			handleSelectAllShortcut(
				editor,
				createSelectAllEvent(),
				fieldEditor,
			),
		).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: "second", offset: 5 },
		});

		editor.selectText(firstBlockId, 2, 2);
		editor.selectAll();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: firstBlockId, offset: 5 },
		});
		editor.selectAll();
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, "second"],
			head: "second",
		});
	});
});
