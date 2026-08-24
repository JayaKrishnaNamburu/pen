// @vitest-environment jsdom

import { defineExtension, ariaReadOnlyFacet } from "@input/pen-core";
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

function createSplitEditor(ariaReadOnlyFacetValue?: boolean) {
	return createTestEditor({
		extensions:
			ariaReadOnlyFacetValue === undefined
				? []
				: [
						defineExtension({
							name: "aria-readonly-split",
							facets: [ariaReadOnlyFacet.of(ariaReadOnlyFacetValue)],
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

describe("Vue pen.ariaReadOnly vs readonly prop", () => {
	it("ariaReadOnly facet announces aria-readonly and still accepts typing", async () => {
		const editor = createSplitEditor(true);
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
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

	it("readonly prop announces aria-readonly and declines typing", async () => {
		const editor = createSplitEditor();
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor, readonly: true },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(ariaReadOnlyFacet)).toBe(false);
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

	it("ariaReadOnly facet plus readonly prop: prop wins for typing, both set aria-readonly", async () => {
		const editor = createSplitEditor(true);
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor, readonly: true },
		});

		const root = wrapper.get("[data-pen-editor-root]");
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
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
