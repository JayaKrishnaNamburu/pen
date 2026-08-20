import { describe, expect, it } from "vitest";
import {
	createEditor,
	getInlineCompletionController,
} from "@input/pen-core";
import { autocompleteExtension } from "../index";

describe("autocomplete anchor mapping", () => {
	it("maps a visible completion anchor through a concurrent edit", () => {
		const editor = createEditor({
			extensions: [autocompleteExtension({ enabled: true, debounceMs: 0 })],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply([{ type: "insert-text", blockId, offset: 0, text: "Hello" }]);
		editor.selectText(blockId, 2, 2);

		const inlineCompletion = getInlineCompletionController(editor);
		inlineCompletion?.showSuggestion({
			id: "ghost-1",
			blockId,
			offset: 2,
			text: " world",
			type: "inline",
		});

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

		editor.apply(
			[{ type: "delete-text", blockId, offset: 4, length: 3 }],
			{ origin: { type: "collaborator" } },
		);
		expect(inlineCompletion?.getState().visibleSuggestion).toBeNull();

		editor.destroy();
	});
});
