// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { FIELD_EDITOR_SLOT_KEY } from "@input/pen-types";
import { afterEach, describe, expect, it } from "vitest";
import { FieldEditorImpl } from "../fieldEditorImpl";
import { fullReconcileDeltasToDOM } from "../reconcilerFull";

class ProbeFieldEditor extends FieldEditorImpl {
	divergenceRequests = 0;

	override requestDivergenceProjection(): void {
		this.divergenceRequests += 1;
		super.requestDivergenceProjection();
	}
}

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
	fieldEditor: ProbeFieldEditor;
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

function seedSlottedEditor() {
	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = new ProbeFieldEditor(editor);
	fixtures.push({ editor, fieldEditor });
	editor.internals.assignSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "insert-text", blockId, offset: 0, text: "hello" },
	]);
	fieldEditor.activate(blockId);
	return { editor, fieldEditor };
}

describe("unfocused reconcile requests I4/P2", () => {
	it("requests a divergence projection after preserveSelection: false", async () => {
		const { editor, fieldEditor } = seedSlottedEditor();
		const host = document.createElement("div");

		fullReconcileDeltasToDOM(
			[
				{
					insert: {
						type: "mention",
						props: { id: "user-ada", label: "Ada" },
					},
				},
			],
			host,
			editor.schema,
			{ editor, preserveSelection: false },
		);

		await Promise.resolve();
		expect(fieldEditor.divergenceRequests).toBe(1);
	});

	it("does not request P2 when the reconcile preserves selection", async () => {
		const { editor, fieldEditor } = seedSlottedEditor();
		const host = document.createElement("div");

		fullReconcileDeltasToDOM([{ insert: "hello" }], host, editor.schema, {
			editor,
			preserveSelection: true,
		});

		await Promise.resolve();
		expect(fieldEditor.divergenceRequests).toBe(0);
	});

	it("does not request P2 while a pointer window is open", async () => {
		const { editor, fieldEditor } = seedSlottedEditor();
		fieldEditor.notifyGestureEvent("pointerdown");
		const host = document.createElement("div");

		fullReconcileDeltasToDOM(
			[
				{
					insert: {
						type: "mention",
						props: { id: "user-ada", label: "Ada" },
					},
				},
			],
			host,
			editor.schema,
			{ editor, preserveSelection: false },
		);

		await Promise.resolve();
		expect(fieldEditor.divergenceRequests).toBe(0);
	});
});
