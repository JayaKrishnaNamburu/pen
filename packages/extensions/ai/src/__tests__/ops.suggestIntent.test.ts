import { buildSplitBlockRecipe, createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";

import { transformOpsForSuggestModeWithMetadata } from "../suggestions/suggestMode";

describe("ops suggest intent GATE 4.8", () => {
	it("renders a split suggestion from intent pen.splitBlock by name", () => {
		const editor = createEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "splice-text",
				blockId,
				from: 0,
				to: 0,
				insert: "hello world",
			},
		]);
		const recipe = buildSplitBlockRecipe({
			block: editor.getBlock(blockId)!,
			offset: 6,
			newBlockId: "dest",
		});
		const result = transformOpsForSuggestModeWithMetadata(
			recipe.ops,
			editor,
			"assistant",
			"ai",
			"test-model",
			"session-1",
			{
				origin: { type: "ai", intent: "pen.splitBlock" },
				suggestionIds: ["suggestion-split"],
			},
		);
		expect(result.suggestions).toContainEqual(
			expect.objectContaining({
				kind: "block",
				action: "split-block",
				id: "suggestion-split",
			}),
		);
		editor.destroy();
	});
});
