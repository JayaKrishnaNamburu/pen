import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { acceptAllSuggestions, aiExtension, getAIController } from "../index";
import { defaultSchema } from "@input/pen-schema-default";

describe("aiExtension: edit_document block conversion", () => {
	it("stages a review-safe block conversion from an edit_document call", async () => {
		let blockId = "";
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: {
						async *stream() {
							yield {
								type: "tool-call" as const,
								toolCallId: "call-1",
								toolName: "edit_document",
								input: {
									operations: [
										{
											operation: "set_block_props",
											blockId,
											blockType: "heading",
											props: { level: 2 },
										},
									],
								},
							};
							yield { type: "done" as const };
						},
					},
					mutationPreference: "suggestions",
					allowedMutatingTools: ["edit_document"],
				}),
			],
		});
		blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" }],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		await controller.runPrompt("Convert block to heading", { blockId });
		const block = editor.getBlock(blockId)!;

		expect(controller.getSuggestions().length).toBeGreaterThan(0);
		expect(block.type).toBe("paragraph");
		expect(block.meta("suggestion")).toMatchObject({
			action: "convert-block",
			authorType: "ai",
		});
		acceptAllSuggestions(editor);
		expect(editor.getBlock(blockId)!.type).toBe("heading");
		expect(editor.getBlock(blockId)!.meta("suggestion")).toBeNull();
	});
});
