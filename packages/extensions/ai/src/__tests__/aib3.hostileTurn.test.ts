import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	toolsExtension,
	getDocumentToolRuntime,
} from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { createModelDouble } from "@input/pen-test";
import { undoExtension } from "@input/pen-undo";
import { AI_TOOL_MAX_CALLS_PER_TURN, isAIToolCallDenied } from "../tools";
import { runAgenticLoop } from "../index";

async function awaitExtensionLifecycle(
	editor: ReturnType<typeof createEditor>,
): Promise<void> {
	await editor.whenReady();
}

function blockTexts(editor: ReturnType<typeof createEditor>): string[] {
	return editor.documentState.blockOrder.map(
		(blockId) => editor.getBlock(blockId)?.textContent() ?? "",
	);
}

describe("AIB3 hostile agentic turn", () => {
	it("AIB3 AIB4: a double requesting 100 mutating calls is default-denied, budgeted, and one undo", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), toolsExtension()],
		});
		await awaitExtensionLifecycle(editor);
		const toolRuntime = getDocumentToolRuntime(editor);
		expect(toolRuntime).toBeTruthy();

		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: seedId,
					from: 0,
					to: 0,
					insert: "seed",
				},
			],
			{ origin: "user" },
		);

		const generation = await runAgenticLoop({
			model: createModelDouble({
				responses: [
					{
						toolCalls: Array.from({ length: 100 }, (_, index) => ({
							toolCallId: `hostile-${index}`,
							toolName:
								index % 2 === 0
									? "insert_block"
									: "delete_block",
							input:
								index % 2 === 0
									? {
											position: "last",
											blockType: "paragraph",
											content: `hostile-${index}`,
										}
									: { blockId: `hostile-missing-${index}` },
						})),
					},
					{ text: "done" },
				],
			}),
			editor,
			toolRuntime: toolRuntime!,
			prompt: "Rewrite the document",
			blockId: seedId,
			generationId: "hostile-turn",
			allowedMutatingTools: ["insert_block"],
		});

		expect(generation.turnReason).toBe("budget-calls-exhausted");
		expect(generation.undoGroupId).toBe("hostile-turn");

		const denied = generation.steps
			.filter((step) => step.type === "tool-call")
			.map((step) => step.output)
			.filter(isAIToolCallDenied);
		expect(
			denied.some((result) => result.reason === "tool-not-allowed"),
		).toBe(true);
		expect(denied.some((result) => result.status === "turn-ended")).toBe(
			true,
		);

		const texts = blockTexts(editor);
		expect(texts[0]).toBe("seed");
		expect(texts.slice(1)).toHaveLength(AI_TOOL_MAX_CALLS_PER_TURN / 2);
		expect(
			texts.slice(1).every((text) => text.startsWith("hostile-")),
		).toBe(true);
		expect(texts.some((text) => text.includes("missing"))).toBe(false);

		expect(editor.undoManager.undo()).toBe(true);
		expect(blockTexts(editor)).toEqual(["seed"]);
		expect(editor.undoManager.undo()).toBe(true);
		expect(blockTexts(editor)).toEqual([""]);

		editor.destroy();
	});
});
