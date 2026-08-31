// @vitest-environment jsdom

import { createTestEditor } from "@input/pen-test";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { PenEditor } from "../components/PenEditor";

afterEach(() => {
	document.body.replaceChildren();
	document.getElementById("pen-editor-chrome")?.remove();
});

describe("HOST6: PenEditor chrome", () => {
	it("adopts editor chrome by default", () => {
		const editor = createTestEditor();
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor },
		});

		expect(document.getElementById("pen-editor-chrome")).toBeInstanceOf(
			HTMLStyleElement,
		);

		wrapper.unmount();
		editor.destroy();
		expect(document.getElementById("pen-editor-chrome")).toBeNull();
	});

	it("chrome false does not adopt the stylesheet", () => {
		const editor = createTestEditor();
		const wrapper = mount(PenEditor, {
			attachTo: document.body,
			props: { editor, chrome: false },
		});

		expect(document.getElementById("pen-editor-chrome")).toBeNull();

		wrapper.unmount();
		editor.destroy();
	});
});
