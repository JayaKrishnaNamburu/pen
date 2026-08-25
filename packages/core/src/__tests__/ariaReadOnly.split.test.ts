import { describe, expect, it } from "vitest";

import { defineExtension } from "../schema/defineExtension";
import { createHeadlessEditor } from "../editor/editor";
import { ariaReadOnlyFacet } from "../facets/coreFacets";
import { defaultSchema } from "./fixtures/testSchema";

function createEditorWithAriaReadOnlyFacet(value: boolean) {
	return createHeadlessEditor({
		schema: defaultSchema,
		extensions: [
			defineExtension({
				name: "aria-readonly-split",
				facets: [ariaReadOnlyFacet.of(value)],
			}),
		],
	});
}

function insertHello(editor: ReturnType<typeof createHeadlessEditor>): string {
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
	return editor.getBlock(blockId)!.textContent();
}

describe("pen.ariaReadOnly vs editor.apply", () => {
	it("ariaReadOnly facet does not gate editor.apply", () => {
		const editor = createEditorWithAriaReadOnlyFacet(true);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(true);
		expect(insertHello(editor)).toBe("hello");
		editor.destroy();
	});

	it("editor.apply is unaffected when the facet is false", () => {
		const editor = createEditorWithAriaReadOnlyFacet(false);
		expect(editor.facet(ariaReadOnlyFacet)).toBe(false);
		expect(insertHello(editor)).toBe("hello");
		editor.destroy();
	});

	it("editor.apply has no readonly option and still writes under a collaborator origin", () => {
		const editor = createEditorWithAriaReadOnlyFacet(true);
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "from-peer",
				},
			],
			{ origin: "collaborator" },
		);
		expect(editor.getBlock(blockId)!.textContent()).toBe("from-peer");
		editor.destroy();
	});
});
