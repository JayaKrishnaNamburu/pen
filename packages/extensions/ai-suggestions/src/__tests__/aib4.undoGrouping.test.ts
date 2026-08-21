import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import {
	aiSuggestionsExtension,
	getAISuggestionsController,
} from "../index";

async function flushTimers(): Promise<void> {
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	await Promise.resolve();
}

describe("AIB4 suggestion accept undo", () => {
	it("AIB4: applying a suggestion group is a single undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				aiSuggestionsExtension({
					debounceMs: 0,
					minStableMs: 0,
					minChangedChars: 1,
					groupGapChars: 80,
					analyzer: {
						async analyze() {
							return {
								candidates: [
									{
										kind: "spelling",
										title: "Spelling",
										originalText: "Ths",
										replacementText: "This",
									},
									{
										kind: "grammar",
										title: "Grammar",
										originalText: "sentece",
										replacementText: "sentence",
									},
								],
							};
						},
					},
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Ths sentece works.",
				},
			],
			{ origin: "user" },
		);
		await flushTimers();

		const controller = getAISuggestionsController(editor)!;
		expect(controller.getState().suggestions).toHaveLength(2);
		const group = controller.getSuggestionGroups()[0];
		expect(group).toBeDefined();
		expect(controller.applySuggestionGroup(group!.id)).toBe(2);
		expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
			"This sentence works.",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe(
			"Ths sentece works.",
		);
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent({ resolved: true })).toBe("");

		editor.destroy();
	});
});
