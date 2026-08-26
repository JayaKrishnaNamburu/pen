import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { acceptAllSuggestions, aiExtension, getAIController } from "../index";
import { defaultSchema } from "@input/pen-schema-default";

describe("aiExtension", () => {
	it("executes review-safe block convert plans through the existing suggestion path", async () => {
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
								type: "text-delta" as const,
								delta: JSON.stringify({
									kind: "block_convert",
									blockId,
									newType: "heading",
									props: { level: 2 },
								}),
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0, to: 0, insert: "Hello" }],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Convert block to heading",
			{
				blockId,
			},
		);
		const block = editor.getBlock(blockId)!;

		expect(generation.planState).toBe("validated");
		expect(generation.plan).toMatchObject({
			kind: "block_convert",
			blockId,
			newType: "heading",
		});
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
