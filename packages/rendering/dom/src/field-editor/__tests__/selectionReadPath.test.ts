import { createEditor, getEditorSelectionRecord } from "@input/pen-core";
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

function seedEditor() {
	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = new FieldEditorImpl(editor);
	fixtures.push({ editor, fieldEditor });
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "insert-text", blockId, offset: 0, text: "hello" },
	]);
	editor.selectText(blockId, 0, 0);
	fieldEditor.activate(blockId);
	return { editor, fieldEditor, blockId };
}

describe("FieldEditorImpl.readDomSelection PR 6", () => {
	it("step 4: a closed window does not write the authority", () => {
		const { editor, fieldEditor, blockId } = seedEditor();
		const before = getEditorSelectionRecord(editor)!;

		const decision = fieldEditor.readDomSelection({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		expect(decision).toBe("diverge");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 0 },
		});
		expect(getEditorSelectionRecord(editor)?.version).toBe(before.version);
	});

	it("step 5: an open pointer window writes origin pointer", () => {
		const { editor, fieldEditor, blockId } = seedEditor();
		fieldEditor.notifyGestureEvent("pointerdown");

		const decision = fieldEditor.readDomSelection({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		expect(decision).toBe("accept");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});
		expect(getEditorSelectionRecord(editor)?.origin).toBe("pointer");
	});

	it("step 5: an open ime window writes origin ime", () => {
		const { editor, fieldEditor, blockId } = seedEditor();
		fieldEditor.notifyGestureEvent("compositionstart");

		const decision = fieldEditor.readDomSelection({
			type: "text",
			anchor: { blockId, offset: 3 },
			focus: { blockId, offset: 3 },
		});

		expect(decision).toBe("accept");
		expect(getEditorSelectionRecord(editor)?.origin).toBe("ime");
	});

	it("step 5: a same-ids block proposal without head keeps T4 head first", () => {
		const { editor, fieldEditor, blockId } = seedEditor();
		editor.apply([
			{
				type: "insert-block",
				blockId: "second",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.setSelection({
			type: "block",
			blockIds: [blockId, "second"],
			head: blockId,
		});
		fieldEditor.notifyGestureEvent("pointerdown");

		const decision = fieldEditor.readDomSelection({
			type: "block",
			blockIds: [blockId, "second"],
		});

		expect(decision).toBe("accept");
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: [blockId, "second"],
			head: blockId,
		});
	});

	it("PR 6: beginPointerSelection opens the window and does not mute reads", () => {
		const { fieldEditor } = seedEditor();
		expect(fieldEditor.shouldHandleDomSelectionChange(0)).toBe(true);
		fieldEditor.beginPointerSelection();
		expect(fieldEditor.isAdmissibleGestureRead()).toBe(true);
		expect(fieldEditor.shouldHandleDomSelectionChange(0)).toBe(true);
	});
});
