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
	it("T1: Mod-a keystroke runs the same ladder as editor.selectAll()", () => {
		const editor = createEditor({ schema: defaultSchema });
		const fieldEditor = new FieldEditorImpl(editor);
		fixtures.push({ editor, fieldEditor });

		const firstBlockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId: firstBlockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
			{
				type: "insert-block",
				blockId: "second",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "second",
				from: 0,
				to: 0,
				insert: "world",
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
			focus: { blockId: firstBlockId, offset: 5 },
		});

		expect(
			handleSelectAllShortcut(
				editor,
				createSelectAllEvent(),
				fieldEditor,
			),
		).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, "second"],
			head: "second",
		});
	});
});
