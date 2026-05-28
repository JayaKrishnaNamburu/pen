import { describe, expect, it } from "vitest";
import {
	createEditor,
	getInlineCompletionController,
} from "@pen/core";
import { FIELD_EDITOR_SLOT_KEY, defineExtension } from "@pen/types";
import {
	autocompleteExtension,
	createAutocompleteProvider,
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

describe("@pen/ai-autocomplete", () => {
	it("promotes long depth-two prose continuations into a new paragraph earlier", async () => {
		let activeEditor: ReturnType<typeof createEditor> | null = null;
		let callCount = 0;
		const fieldEditor = {
			focusBlockId: null as string | null,
			isEditing: true,
			isFocused: true,
			isComposing: false,
		};
		const editor = createEditor({
			extensions: [
				autocompleteExtension({
					debounceMs: 0,
					prefetchAfterAccept: true,
					model: {
						async *stream() {
							callCount += 1;
							if (callCount === 1) {
								yield {
									type: "text-delta" as const,
									delta: '", tired from a long day at work."',
								};
								yield { type: "done" as const };
								return;
							}
							yield {
								type: "text-delta" as const,
								delta:
									'", but happy to be back. He looked forward to a quiet evening at home, away from the hustle and bustle of the office."',
							};
							yield { type: "done" as const };
						},
					},
				}),
				defineExtension({
					name: "test-field-editor-slot",
					activateClient: async ({ editor: nextEditor }) => {
						activeEditor = nextEditor;
						nextEditor.internals.setSlot(FIELD_EDITOR_SLOT_KEY, fieldEditor);
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
		editor.apply([{
			type: "insert-text",
			blockId,
			offset: 0,
			text: "He came home ",
		}]);
		editor.selectText(blockId, 13, 13);

		const controller = getAutocompleteController(editor);
		const inlineCompletion = getInlineCompletionController(editor);
		expect(controller?.request({ explicit: true })).toBe(true);
		await waitForCondition(
			() =>
				inlineCompletion?.getState().visibleSuggestion?.text ===
				"tired from a long day at work.",
		);

		expect(controller?.acceptVisibleSuggestion()).toBe(true);
		await waitForCondition(
			() => (inlineCompletion?.getState().visibleSuggestion?.previewBlocks?.length ?? 0) === 1,
		);

		expect(inlineCompletion?.getState().visibleSuggestion?.previewBlocks).toEqual([
			expect.objectContaining({
				blockType: "paragraph",
				text: expect.stringContaining(
					"He looked forward to a quiet evening at home, away from the hustle and bustle of the office.",
				),
			}),
		]);

		expect(controller?.acceptVisibleSuggestion()).toBe(true);

		const secondBlock = editor.getBlock(blockId)?.next;
		expect(secondBlock?.type).toBe("paragraph");
		expect(secondBlock?.textContent()).toContain(
			"He looked forward to a quiet evening at home, away from the hustle and bustle of the office.",
		);

		editor.destroy();
	});
});
