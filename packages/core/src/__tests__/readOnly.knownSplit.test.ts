import { describe, expect, it } from "vitest";

import { defineExtension } from "../schema/defineExtension";
import { createHeadlessEditor } from "../editor/editor";
import { readOnlyFacet } from "../facets/coreFacets";
import { defaultSchema } from "./fixtures/testSchema";

function createEditorWithReadOnlyFacet(value: boolean) {
	return createHeadlessEditor({
		schema: defaultSchema,
		extensions: [
			defineExtension({
				name: "readonly-known-split",
				facets: [readOnlyFacet.of(value)],
			}),
		],
	});
}

function insertHello(editor: ReturnType<typeof createHeadlessEditor>): string {
	const blockId = editor.firstBlock()!.id;
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
		.getBlock(blockId)!
		.textContent()
		.replace(/\u200B/g, "");
}

describe("pen.readOnly vs editor.apply (known split, owner decision pending)", () => {
	it("readOnly facet does not gate editor.apply (known split, owner decision pending)", () => {
		const editor = createEditorWithReadOnlyFacet(true);
		expect(editor.facet(readOnlyFacet)).toBe(true);
		expect(insertHello(editor)).toBe("hello");
		editor.destroy();
	});

	it("editor.apply is unaffected when the facet is false (known split, owner decision pending)", () => {
		const editor = createEditorWithReadOnlyFacet(false);
		expect(editor.facet(readOnlyFacet)).toBe(false);
		expect(insertHello(editor)).toBe("hello");
		editor.destroy();
	});

	it("editor.apply has no readonly option and still writes under a collaborator origin (known split, owner decision pending)", () => {
		const editor = createEditorWithReadOnlyFacet(true);
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "from-peer",
				},
			],
			{ origin: "collaborator" },
		);
		expect(
			editor
				.getBlock(blockId)!
				.textContent()
				.replace(/\u200B/g, ""),
		).toBe("from-peer");
		editor.destroy();
	});
});
