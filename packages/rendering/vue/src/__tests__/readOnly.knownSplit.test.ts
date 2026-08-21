// @vitest-environment jsdom

import { defineExtension, readOnlyFacet } from "@input/pen-core";
import type { FieldEditorImpl } from "@input/pen-dom";
import { createTestEditor } from "@input/pen-test";
import { FIELD_EDITOR_SLOT_KEY } from "@input/pen-types";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { PenEditor } from "../components/PenEditor";
import { FIELD_EDITOR_SLOT_KEY as VUE_FIELD_EDITOR_SLOT_KEY } from "../constants/fieldEditor";

afterEach(() => {
	document.body.replaceChildren();
});

function createSplitEditor(readOnlyFacetValue?: boolean) {
	return createTestEditor({
		extensions:
			readOnlyFacetValue === undefined
				? []
				: [
						defineExtension({
							name: "readonly-known-split",
							facets: [readOnlyFacet.of(readOnlyFacetValue)],
						}),
					],
		blocks: [
			{
				id: "paragraph-1",
				type: "paragraph",
				props: {},
				content: "Locked",
			},
		],
	});
}

function insertHello(
	editor: ReturnType<typeof createTestEditor>,
	blockId = "paragraph-1",
): string {
	editor.apply(
		[
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		],
		{ origin: "user" },
	);
	return editor
		.getBlock(blockId)
		.textContent()
		.replace(/\u200B/g, "");
}

function fieldEditor(
	editor: ReturnType<typeof createTestEditor>,
): FieldEditorImpl | null {
	return (
		editor.internals.getSlot<FieldEditorImpl>(FIELD_EDITOR_SLOT_KEY) ??
		editor.internals.getSlot<FieldEditorImpl>(VUE_FIELD_EDITOR_SLOT_KEY) ??
		null
	);
}

describe("Vue pen.readOnly vs readonly prop (known split, owner decision pending)", () => {
	it("readOnly facet announces aria-readonly and still accepts typing (known split, owner decision pending)", async () => {
		const editor = createSplitEditor(true);
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(readOnlyFacet)).toBe(true);
		expect(root.attributes("aria-readonly")).toBe("true");
		expect(root.attributes("data-readonly")).toBeUndefined();

		await wrapper.get("[data-pen-inline-content]").trigger("mousedown");
		await wrapper.get("[data-pen-inline-content]").trigger("click");
		await nextTick();

		expect(fieldEditor(editor)?.isEditing).toBe(true);
		expect(
			wrapper.find("[data-pen-field-editor-active-surface]").exists(),
		).toBe(true);
		expect(insertHello(editor)).toBe("helloLocked");

		wrapper.unmount();
		editor.destroy();
	});

	it("readonly prop announces aria-readonly and declines typing (known split, owner decision pending)", async () => {
		const editor = createSplitEditor();
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor, readonly: true },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(readOnlyFacet)).toBe(false);
		expect(root.attributes("aria-readonly")).toBe("true");
		expect(root.attributes("data-readonly")).toBe("");

		await wrapper.get("[data-pen-inline-content]").trigger("mousedown");
		await wrapper.get("[data-pen-inline-content]").trigger("click");
		await nextTick();

		expect(fieldEditor(editor)?.isEditing).toBe(false);
		expect(
			wrapper.find("[data-pen-field-editor-active-surface]").exists(),
		).toBe(false);
		expect(insertHello(editor)).toBe("helloLocked");

		wrapper.unmount();
		editor.destroy();
	});

	it("readOnly facet plus readonly prop: prop wins for typing, both set aria-readonly (known split, owner decision pending)", async () => {
		const editor = createSplitEditor(true);
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor, readonly: true },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(readOnlyFacet)).toBe(true);
		expect(root.attributes("aria-readonly")).toBe("true");
		expect(root.attributes("data-readonly")).toBe("");

		await wrapper.get("[data-pen-inline-content]").trigger("mousedown");
		await wrapper.get("[data-pen-inline-content]").trigger("click");
		await nextTick();

		expect(fieldEditor(editor)?.isEditing).toBe(false);
		expect(
			wrapper.find("[data-pen-field-editor-active-surface]").exists(),
		).toBe(false);
		expect(insertHello(editor)).toBe("helloLocked");

		wrapper.unmount();
		editor.destroy();
	});
});
