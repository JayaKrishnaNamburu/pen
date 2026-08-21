import { describe, expect, it } from "vitest";
import {
	createEditor,
	defineExtension,
	getInlineCompletionController,
} from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { createModelDouble } from "@input/pen-test";
import { undoExtension } from "@input/pen-undo";
import { FIELD_EDITOR_SLOT_KEY } from "@input/pen-types";
import {
	autocompleteExtension,
	getAutocompleteController,
} from "../index";

async function waitForCondition(
	check: () => boolean,
	maxTicks = 20,
): Promise<void> {
	for (let tick = 0; tick < maxTicks; tick += 1) {
		if (check()) {
			return;
		}
		await Promise.resolve();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
	throw new Error("Condition was not met in time.");
}

describe("AIB4 autocomplete accept undo", () => {
	it("AIB4: autocomplete accept is a single undo step", async () => {
		let activeEditor: ReturnType<typeof createEditor> | null = null;
		const fieldEditor = {
			focusBlockId: null as string | null,
			isEditing: true,
			isFocused: true,
			isComposing: false,
		};
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				autocompleteExtension({
					debounceMs: 0,
					model: createModelDouble({
						responses: [{ text: " world from pen" }],
					}),
				}),
				defineExtension({
					name: "test-field-editor-slot",
					activateClient: async ({ editor: nextEditor }) => {
						activeEditor = nextEditor;
						nextEditor.internals.setSlot(
							FIELD_EDITOR_SLOT_KEY,
							fieldEditor,
						);
					},
					deactivateClient: async () => {
						activeEditor?.internals.setSlot(FIELD_EDITOR_SLOT_KEY, null);
						activeEditor = null;
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		fieldEditor.focusBlockId = blockId;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "user" },
		);
		editor.selectText(blockId, 5, 5);

		const controller = getAutocompleteController(editor);
		const inlineCompletion = getInlineCompletionController(editor);
		expect(controller?.request({ explicit: true })).toBe(true);
		await waitForCondition(
			() =>
				inlineCompletion?.getState().visibleSuggestion?.text ===
				" world from pen",
		);

		expect(controller?.acceptVisibleSuggestion()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe(
			"Hello world from pen",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");

		editor.destroy();
	});
});
