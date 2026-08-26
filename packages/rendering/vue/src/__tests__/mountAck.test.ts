// @vitest-environment jsdom

import { fieldEditorHostFacet } from "@input/pen-core";
import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { DATA_ATTRS } from "@input/pen-dom/utils/dataAttributes";
import { PenEditor } from "../components/PenEditor";
import type { VueFieldEditor } from "../internal/fieldEditorContext";

afterEach(() => {
	document.body.replaceChildren();
});

describe("@input/pen-vue mount ack", () => {
	it("acks mounted blocks from PenEditor before the next tick", async () => {
		const editor = createTestEditor({
			blocks: [
				{
					id: "paragraph-1",
					type: "paragraph",
					props: {},
					content: "First",
				},
			],
		});
		const acks: string[] = [];
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor },
		});

		const fieldEditor = editor.facet(
			fieldEditorHostFacet,
		) as VueFieldEditor | null;
		if (!fieldEditor) {
			throw new Error("Missing attached field editor");
		}
		const original = fieldEditor.ackBlockMounted.bind(fieldEditor);
		fieldEditor.ackBlockMounted = (blockId, element) => {
			acks.push(blockId);
			original(blockId, element);
		};

		editor.apply([
			{
				type: "splice-text",
				blockId: "paragraph-1",
				from: 5,
				to: 5,
				insert: "!",
			},
		]);
		await nextTick();

		expect(acks).toContain("paragraph-1");
		expect(wrapper.find(`[${DATA_ATTRS.editorBlock}]`).exists()).toBe(true);

		wrapper.unmount();
		editor.destroy();
	});
});
