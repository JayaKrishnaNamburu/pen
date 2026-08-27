// @vitest-environment jsdom

import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PenEditor } from "../components/PenEditor";

afterEach(() => {
	document.body.replaceChildren();
});

function mountEditor(editor: ReturnType<typeof createTestEditor>) {
	return mount(PenEditor, { attachTo: document.body, props: { editor } });
}

/**
 * RI5 is a per-surface declaration, so a React test cannot vouch for it here
 * (HB5). Without these, dropping `whiteSpace` from the Vue components leaves
 * every gate green while stored newlines collapse.
 */
describe("Vue RI5 text entry whitespace", () => {
	it("RI5: the inline content host carries pre-wrap", () => {
		const editor = createTestEditor({
			blocks: [
				{
					id: "paragraph-1",
					type: "paragraph",
					props: {},
					content: "Hello",
				},
			],
		});
		const wrapper = mountEditor(editor);
		const inline = wrapper.get("[data-pen-inline-content]");

		expect((inline.element as HTMLElement).style.whiteSpace).toBe("pre-wrap");

		wrapper.unmount();
		editor.destroy();
	});

	it("RI5: every table cell content host carries pre-wrap", () => {
		const editor = createTestEditor({
			blocks: [{ id: "table-1", type: "table", props: {} }],
		});
		const wrapper = mountEditor(editor);
		const cells = wrapper.findAll("[data-pen-table-cell] [data-pen-inline-content]");

		expect(cells.length).toBeGreaterThan(0);
		for (const cell of cells) {
			expect((cell.element as HTMLElement).style.whiteSpace).toBe("pre-wrap");
		}

		wrapper.unmount();
		editor.destroy();
	});
});
