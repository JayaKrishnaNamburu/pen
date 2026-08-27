// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
	createEditor,
	fieldEditorHostFacet,
	getVerticalCaretMeasure,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { Editor } from "@input/pen-types";
import { mountEditor } from "../host/mountEditor";
import { DATA_ATTRS } from "../utils/dataAttributes";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
	});
}

describe("mountEditor", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
		document.body.replaceChildren();
	});

	it("composes the same editor-root and inline-content shell the bindings mount", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		expect(root.getAttribute("role")).toBe("textbox");
		expect(root.getAttribute("aria-label")).toBe("Editor");
		expect(root.hasAttribute(DATA_ATTRS.editorRoot)).toBe(true);
		expect(root.querySelector("[data-pen-editor-content]")).toBeTruthy();
		expect(
			root.querySelector("[data-pen-editor-blocks-host]"),
		).toBeTruthy();

		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		expect(inline).toBeInstanceOf(HTMLElement);
		const placeholder = inline?.querySelector(`[${DATA_ATTRS.emptyBlock}]`);
		expect(placeholder?.tagName).toBe("BR");
		expect(placeholder?.getAttribute(DATA_ATTRS.emptyBlock)).toBe("");
		expect(inline?.textContent).toBe("");
		expect(editor.facet(fieldEditorHostFacet)).toBe(mounted.fieldEditor);
	});

	it("activates FieldEditorImpl on inline pointer down", () => {
		const editor = createBareEditor();
		const firstBlock = editor.firstBlock();
		expect(firstBlock).toBeTruthy();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		expect(inline).toBeInstanceOf(HTMLElement);
		inline?.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, button: 0 }),
		);

		expect(mounted.fieldEditor.focusBlockId).toBe(firstBlock?.id);
		expect(mounted.fieldEditor.isEditing).toBe(true);
		expect(
			root
				.querySelector(`[${DATA_ATTRS.editorBlock}]`)
				?.getAttribute(DATA_ATTRS.focused),
		).toBe("");
	});

	it("activates FieldEditorImpl when the pointer hits the block, not the inline", () => {
		const editor = createBareEditor();
		const firstBlock = editor.firstBlock();
		expect(firstBlock).toBeTruthy();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		const paragraph = root.querySelector("[data-block-type='paragraph']");
		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		expect(paragraph).toBeInstanceOf(HTMLElement);
		expect(paragraph).not.toBe(inline);
		paragraph?.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, button: 0 }),
		);

		expect(mounted.fieldEditor.focusBlockId).toBe(firstBlock?.id);
		expect(mounted.fieldEditor.isEditing).toBe(true);
	});

	it("reconciles existing block text into the inline surface", () => {
		const editor = createBareEditor();
		const firstBlock = editor.firstBlock();
		expect(firstBlock).toBeTruthy();
		if (firstBlock) {
			editor.apply(
				[
					{
						type: "splice-text",
						blockId: firstBlock.id,
						from: 0,
						to: 0,
						insert: "Hello",
					},
				],
				{ origin: "user" },
			);
		}

		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		expect(inline?.textContent).toContain("Hello");
	});

	it("HOST6: boolean data attributes are valueless", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root, { readonly: true });
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		expect(root.getAttribute(DATA_ATTRS.readonly)).toBe("");
		expect(root.hasAttribute(DATA_ATTRS.empty)).toBe(false);
	});

	it("registers setVerticalCaretMeasure after the field editor attaches", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});

		expect(getVerticalCaretMeasure(editor)).toEqual(expect.any(Function));
	});

	it("clears the vertical caret measure on destroy", () => {
		const editor = createBareEditor();
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(editor, root);
		mounted.destroy();
		cleanups.push(() => {
			editor.destroy();
		});

		expect(getVerticalCaretMeasure(editor)).toBeUndefined();
	});
});
