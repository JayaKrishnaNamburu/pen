import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import type { EditorSelectAllBehavior } from "../../constants/selectAll";
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

/** Two paragraphs, "hello" and "world", with the caret parked in `caretIn`. */
function createTwoBlockFixture(options: {
	selectAllBehavior: EditorSelectAllBehavior;
	caretIn?: "first" | "second";
}): {
	editor: ReturnType<typeof createEditor>;
	fieldEditor: FieldEditorImpl;
	firstBlockId: string;
} {
	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = new FieldEditorImpl(editor, {
		selectAllBehavior: options.selectAllBehavior,
	});
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

	const caretBlockId = options.caretIn === "second" ? "second" : firstBlockId;
	editor.selectText(caretBlockId, 2, 2);
	fieldEditor.activate(caretBlockId);

	return { editor, fieldEditor, firstBlockId };
}

function pressSelectAll(
	editor: ReturnType<typeof createEditor>,
	fieldEditor: FieldEditorImpl,
): boolean {
	return handleSelectAllShortcut(editor, createSelectAllEvent(), fieldEditor);
}

describe("handleSelectAllShortcut vs T1 ladder", () => {
	it("T1: block-first Mod-a takes the block rung, then BlockSelection", () => {
		const { editor, fieldEditor, firstBlockId } = createTwoBlockFixture({
			selectAllBehavior: "block-first",
		});

		expect(pressSelectAll(editor, fieldEditor)).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: firstBlockId, offset: 5 },
		});

		expect(pressSelectAll(editor, fieldEditor)).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, "second"],
			head: "second",
		});
	});

	it("T1: document-first Mod-a covers all content, then BlockSelection", () => {
		const { editor, fieldEditor, firstBlockId } = createTwoBlockFixture({
			selectAllBehavior: "document-first",
		});

		expect(pressSelectAll(editor, fieldEditor)).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: "second", offset: 5 },
		});

		expect(pressSelectAll(editor, fieldEditor)).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: [firstBlockId, "second"],
			head: "second",
		});
	});

	it("T1: document-first reaches back past the active block", () => {
		const { editor, fieldEditor, firstBlockId } = createTwoBlockFixture({
			selectAllBehavior: "document-first",
			caretIn: "second",
		});

		expect(pressSelectAll(editor, fieldEditor)).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 0 },
			focus: { blockId: "second", offset: 5 },
		});
	});
});
