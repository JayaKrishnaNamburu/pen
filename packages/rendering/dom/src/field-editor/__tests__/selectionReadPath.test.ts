// @vitest-environment jsdom

import { createEditor, getEditorSelectionRecord } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { shouldIgnoreLeftoverFieldAfterDocumentSelectAll } from "../documentSelectAllLeftover";
import { FieldEditorImpl } from "../fieldEditorImpl";

class ProbeFieldEditor extends FieldEditorImpl {
	divergenceRequests = 0;

	override requestDivergenceProjection(): void {
		this.divergenceRequests += 1;
		super.requestDivergenceProjection();
	}
}

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

function seedEditor(
	fieldEditorFactory?: (
		editor: ReturnType<typeof createEditor>,
	) => FieldEditorImpl,
) {
	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = fieldEditorFactory
		? fieldEditorFactory(editor)
		: new FieldEditorImpl(editor);
	fixtures.push({ editor, fieldEditor });
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "hello" },
	]);
	editor.selectText(blockId, 0, 0);
	fieldEditor.activate(blockId);
	return { editor, fieldEditor, blockId };
}

function seedProbeEditor() {
	const seeded = seedEditor((editor) => new ProbeFieldEditor(editor));
	return {
		...seeded,
		fieldEditor: seeded.fieldEditor as ProbeFieldEditor,
	};
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

	it("I4: a closed-window cell caret move through the reader diverges and requests P2", () => {
		const { editor, fieldEditor, blockId } = seedProbeEditor();
		editor.selectText(blockId, 1, 1);
		const before = getEditorSelectionRecord(editor)!;

		const decision = fieldEditor.readDomSelection({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		expect(decision).toBe("diverge");
		expect(fieldEditor.divergenceRequests).toBe(1);
		expect(getEditorSelectionRecord(editor)?.version).toBe(before.version);
	});

	it("document-select-all leftover through the reader diverges and does not request P2", () => {
		const { editor, fieldEditor, blockId } = seedProbeEditor();
		editor.apply([
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
		editor.selectTextRange(
			{ blockId, offset: 0 },
			{ blockId: "second", offset: 5 },
		);
		const leftover = {
			type: "text" as const,
			anchor: { blockId, offset: 0 },
			focus: { blockId, offset: 5 },
		};
		expect(
			shouldIgnoreLeftoverFieldAfterDocumentSelectAll(
				editor.selection,
				leftover,
			),
		).toBe(true);
		const before = getEditorSelectionRecord(editor)!;

		const decision = fieldEditor.readDomSelection(leftover);

		expect(decision).toBe("diverge");
		expect(fieldEditor.divergenceRequests).toBe(0);
		expect(getEditorSelectionRecord(editor)?.version).toBe(before.version);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 0 },
			focus: { blockId: "second", offset: 5 },
		});
	});

	it("document-select-all leftover is accepted while a pointer window is open", () => {
		const { editor, fieldEditor, blockId } = seedProbeEditor();
		editor.apply([
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
		editor.selectTextRange(
			{ blockId, offset: 0 },
			{ blockId: "second", offset: 5 },
		);
		fieldEditor.notifyGestureEvent("pointerdown");

		const decision = fieldEditor.readDomSelection({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});

		expect(decision).toBe("accept");
		expect(fieldEditor.divergenceRequests).toBe(0);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 2 },
			focus: { blockId, offset: 2 },
		});
	});
});
