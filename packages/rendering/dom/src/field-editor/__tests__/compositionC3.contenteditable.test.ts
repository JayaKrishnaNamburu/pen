// @vitest-environment jsdom

import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import { FieldEditorImpl } from "../fieldEditorImpl";

const COMPOSED = "あい";

const fixtures: Array<{
	editor: ReturnType<typeof createEditor>;
	fieldEditor: FieldEditorImpl;
	root: HTMLElement;
}> = [];

afterEach(() => {
	while (fixtures.length > 0) {
		const fixture = fixtures.pop();
		if (!fixture) {
			break;
		}
		fixture.fieldEditor.destroy();
		fixture.root.remove();
		fixture.editor.destroy();
	}
});

function mountContentEditableEditor(text: string) {
	delete (globalThis as { EditContext?: unknown }).EditContext;

	const editor = createEditor({ schema: defaultSchema });
	const fieldEditor = new FieldEditorImpl(editor);
	const root = document.createElement("div");
	root.setAttribute(DATA_ATTRS.editorRoot, "");
	document.body.appendChild(root);
	const blockId = editor.firstBlock()!.id;
	editor.apply([
		{ type: "splice-text", blockId, from: 0, to: 0, insert: text },
	]);
	const block = document.createElement("div");
	block.setAttribute(DATA_ATTRS.editorBlock, "");
	block.setAttribute(DATA_ATTRS.blockId, blockId);
	const inline = document.createElement("div");
	inline.setAttribute(DATA_ATTRS.inlineContent, "");
	inline.textContent = text;
	block.appendChild(inline);
	root.appendChild(block);
	fieldEditor.setRootElement(root);
	fieldEditor.activate(blockId);
	fixtures.push({ editor, fieldEditor, root });
	return { editor, fieldEditor, root, blockId, inline };
}

describe("C3 contenteditable compositionend", () => {
	it("C3: authority has composed text before the next frame", () => {
		const { editor, inline, blockId } =
			mountContentEditableEditor("Hello world");
		inline.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		);
		inline.append(COMPOSED);
		inline.dispatchEvent(
			new CompositionEvent("compositionend", {
				bubbles: true,
				data: COMPOSED,
			}),
		);

		expect(
			editor.getBlock(blockId)?.textContent()?.includes(COMPOSED),
			"C3: authority has composed text before the next frame",
		).toBe(true);
	});

	it("C3: first commit survived the GBoard fast cycle", () => {
		const { editor, inline, blockId } =
			mountContentEditableEditor("Hello world");
		inline.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		);
		inline.append(COMPOSED);
		inline.dispatchEvent(
			new CompositionEvent("compositionend", {
				bubbles: true,
				data: COMPOSED,
			}),
		);
		inline.dispatchEvent(
			new CompositionEvent("compositionstart", { bubbles: true }),
		);

		expect(
			editor.getBlock(blockId)?.textContent()?.includes(COMPOSED),
			"C3: first commit survived the GBoard fast cycle",
		).toBe(true);
	});
});
