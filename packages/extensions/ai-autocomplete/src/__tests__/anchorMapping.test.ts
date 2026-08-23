import { describe, expect, it } from "vitest";
import {
	createEditor,
	getInlineCompletionController,
} from "@input/pen-core";
import { autocompleteExtension, getAutocompleteController } from "../index";
import type { AutocompleteControllerImpl } from "../autocompleteControllerCore";
import { defaultSchema } from "@input/pen-schema-default";

describe("autocomplete anchor mapping", () => {
	it("maps a visible completion anchor through a concurrent edit", () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [autocompleteExtension({ enabled: true, debounceMs: 0 })],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
			{
				type: "insert-block",
				blockId: "keep",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		editor.selectText(blockId, 2, 2);

		const inlineCompletion = getInlineCompletionController(editor);
		const controller = getAutocompleteController(
			editor,
		) as AutocompleteControllerImpl;
		inlineCompletion?.showSuggestion({
			id: "ghost-1",
			blockId,
			offset: 2,
			text: " world",
			type: "inline",
		});
		controller._visibleAnchor = editor.anchors.create(
			{ blockId, offset: 2 },
			1,
		);
		controller._visibleSuggestionId = "ghost-1";

		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "xxx" }],
			{ origin: { type: "collaborator" } },
		);

		expect(inlineCompletion?.getState().visibleSuggestion).toMatchObject({
			id: "ghost-1",
			blockId,
			offset: 5,
			text: " world",
		});

		editor.apply([{ type: "delete-block", blockId }], {
			origin: { type: "collaborator" },
		});
		expect(inlineCompletion?.getState().visibleSuggestion).toBeNull();

		editor.destroy();
	});
});
