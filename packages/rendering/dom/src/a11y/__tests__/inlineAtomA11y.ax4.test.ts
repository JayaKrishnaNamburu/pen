// @vitest-environment jsdom

import { createHeadlessEditor } from "@input/pen-core";
import { afterEach, describe, expect, it } from "vitest";

import { createInlineAtomElement } from "../../field-editor/inlineAtomDom";
import { defaultSchema } from "@input/pen-schema-default";

const editors: Array<ReturnType<typeof createHeadlessEditor>> = [];

afterEach(() => {
	while (editors.length > 0) {
		void editors.pop()?.destroy();
	}
});

describe("inline atom a11y (AX4)", () => {
	it("AX4: mention chips use the schema a11y label and role description", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		editors.push(editor);

		const host = createInlineAtomElement(
			{ type: "mention", props: { id: "1", label: "Ada" } },
			editor.schema,
		);
		const chip = host.querySelector("[data-pen-inline-atom]");
		expect(chip?.getAttribute("aria-label")).toBe("@Ada");
		expect(chip?.getAttribute("aria-roledescription")).toBe("mention");
		expect(chip?.getAttribute("aria-hidden")).toBeNull();
	});
});
