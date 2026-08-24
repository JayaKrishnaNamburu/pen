// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { createEditor, defineExtension, ariaReadOnlyFacet } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { type Editor } from "@input/pen-types";
import { mountEditor } from "../host/mountEditor";
import { DATA_ATTRS } from "../utils/dataAttributes";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createBareEditor(ariaReadOnlyFacetValue?: boolean): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
		extensions:
			ariaReadOnlyFacetValue === undefined
				? []
				: [
						defineExtension({
							name: "aria-readonly-split",
							facets: [ariaReadOnlyFacet.of(ariaReadOnlyFacetValue)],
						}),
					],
	});
}

function insertHello(editor: Editor): string {
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello",
			},
		],
		{ origin: "user" },
	);
	return editor
		.getBlock(blockId)!
		.textContent()
		.replace(/\u200B/g, "");
}

describe("mountEditor pen.ariaReadOnly vs readonly prop", () => {
	const cleanups: Array<() => void> = [];

	afterEach(() => {
		for (const cleanup of cleanups.splice(0)) {
			cleanup();
		}
		document.body.replaceChildren();
	});

	function mount(
		editor: Editor,
		readonly?: boolean,
	): ReturnType<typeof mountEditor> {
		const root = document.createElement("div");
		document.body.append(root);
		const mounted = mountEditor(
			editor,
			root,
			readonly === undefined ? {} : { readonly },
		);
		cleanups.push(() => {
			mounted.destroy();
			editor.destroy();
		});
		return mounted;
	}

	function activateInline(root: HTMLElement): void {
		const inline = root.querySelector(`[${DATA_ATTRS.inlineContent}]`);
		expect(inline).toBeInstanceOf(HTMLElement);
		inline?.dispatchEvent(
			new MouseEvent("mousedown", { bubbles: true, button: 0 }),
		);
	}

	it("ariaReadOnly facet announces aria-readonly and still accepts typing", () => {
		const editor = createBareEditor(true);
		const mounted = mount(editor);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
		expect(mounted.root.getAttribute("aria-readonly")).toBe("true");
		expect(mounted.root.hasAttribute(DATA_ATTRS.readonly)).toBe(false);

		activateInline(mounted.root);
		expect(mounted.fieldEditor.isEditing).toBe(true);
		expect(insertHello(editor)).toBe("hello");
	});

	it("readonly prop announces aria-readonly and declines typing", () => {
		const editor = createBareEditor();
		const mounted = mount(editor, true);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(false);
		expect(mounted.root.getAttribute("aria-readonly")).toBe("true");
		expect(mounted.root.getAttribute(DATA_ATTRS.readonly)).toBe("");

		activateInline(mounted.root);
		expect(mounted.fieldEditor.isEditing).toBe(false);
		expect(insertHello(editor)).toBe("hello");
	});

	it("ariaReadOnly facet plus readonly prop: prop wins for typing, both set aria-readonly", () => {
		const editor = createBareEditor(true);
		const mounted = mount(editor, true);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
		expect(mounted.root.getAttribute("aria-readonly")).toBe("true");
		expect(mounted.root.getAttribute(DATA_ATTRS.readonly)).toBe("");

		activateInline(mounted.root);
		expect(mounted.fieldEditor.isEditing).toBe(false);
		expect(insertHello(editor)).toBe("hello");
	});
});
