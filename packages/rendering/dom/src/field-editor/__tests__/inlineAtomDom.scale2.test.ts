// @vitest-environment jsdom

import { createHeadlessEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { afterEach, describe, expect, it } from "vitest";
import { DATA_ATTRS } from "../../utils/dataAttributes";
import {
	areInlineAtomElementDataEqual,
	createInlineAtomElement,
	getInlineAtomElementData,
} from "../inlineAtomDom";

const editors: Array<ReturnType<typeof createHeadlessEditor>> = [];

afterEach(() => {
	while (editors.length > 0) {
		void editors.pop()?.destroy();
	}
});

describe("inline atom DOM props", () => {
	it("SCALE2 I8: rereading an unchanged atom returns the same data object", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		editors.push(editor);

		const host = createInlineAtomElement(
			{ type: "mention", props: { id: "1", label: "Ada" } },
			editor.schema,
		);
		const first = getInlineAtomElementData(host);
		const second = getInlineAtomElementData(host);

		expect(first).not.toBeNull();
		expect(second).toBe(first);
	});

	it("SCALE2: atom props with reordered keys or a dropped undefined member compare equal", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		editors.push(editor);

		const left = createInlineAtomElement(
			{ type: "mention", props: { id: "1", label: "Ada" } },
			editor.schema,
		);
		const right = createInlineAtomElement(
			{
				type: "mention",
				props: { label: "Ada", id: "1", extra: undefined },
			},
			editor.schema,
		);

		expect(
			JSON.stringify({ id: "1", label: "Ada" }) ===
				JSON.stringify({ label: "Ada", id: "1" }),
		).toBe(false);
		expect(areInlineAtomElementDataEqual(left, right)).toBe(true);
		expect(
			left
				.querySelector(`[${DATA_ATTRS.inlineAtom}]`)
				?.getAttribute(DATA_ATTRS.inlineAtomProps),
		).toBeNull();
	});
});
