import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "@input/pen-delta-stream";
import { documentOpsExtension } from "@input/pen-document-ops";
import { getDocumentToolRuntime } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { createModelDouble } from "@input/pen-test";
import { AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY } from "@input/pen-types";
import {
	acceptAllSuggestions,
	acceptSuggestion,
	aiExtension,
	applySuggestedAIOperations,
	getAIController,
	readAllSuggestions,
	runAgenticLoop,
} from "../index";
import { scriptedModel } from "./extension.testUtils";

async function awaitExtensionLifecycle(
	editor: ReturnType<typeof createEditor>,
): Promise<void> {
	await (editor.internals.getSlot<() => Promise<void>>(
		AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	)?.() ?? Promise.resolve());
}

describe("AIB4 undo grouping", () => {
	it("AIB4: generation is a single undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: scriptedModel(" world"),
				}),
			],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "system" },
		);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt("Continue", { blockId });
		expect(generation.status).toBe("complete");
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello world");

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello");
		expect(editor.undoManager.undo()).toBe(false);

		editor.destroy();
	});

	it("AIB4: tool calls in one turn are a single undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), documentOpsExtension()],
		});
		await awaitExtensionLifecycle(editor);
		const toolRuntime = getDocumentToolRuntime(editor);
		expect(toolRuntime).toBeTruthy();

		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId: seedId, offset: 0, text: "seed" }],
			{ origin: "user" },
		);

		await runAgenticLoop({
			model: createModelDouble({
				responses: [
					{
						toolCalls: [
							{
								toolCallId: "a",
								toolName: "insert_block",
								input: {
									position: "last",
									blockType: "paragraph",
									content: "one",
								},
							},
							{
								toolCallId: "b",
								toolName: "insert_block",
								input: {
									position: "last",
									blockType: "paragraph",
									content: "two",
								},
							},
							{
								toolCallId: "c",
								toolName: "insert_block",
								input: {
									position: "last",
									blockType: "paragraph",
									content: "three",
								},
							},
						],
					},
					{ text: "done" },
				],
			}),
			editor,
			toolRuntime: toolRuntime!,
			prompt: "Add three blocks",
			blockId: seedId,
			generationId: "tool-turn",
			allowedMutatingTools: ["insert_block"],
		});

		expect(
			editor.documentState.blockOrder.map(
				(blockId) => editor.getBlock(blockId)?.textContent() ?? "",
			),
		).toEqual(["seed", "one", "two", "three"]);

		expect(editor.undoManager.undo()).toBe(true);
		expect(
			editor.documentState.blockOrder.map(
				(blockId) => editor.getBlock(blockId)?.textContent() ?? "",
			),
		).toEqual(["seed"]);

		editor.destroy();
	});

	it("AIB4: suggestion accept is a single undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({ suggestMode: true, author: "tester" }),
			],
		});
		const firstBlockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "insert-text",
					blockId: firstBlockId,
					offset: 0,
					text: "Hello",
				},
			],
			{ origin: "user" },
		);
		editor.apply(
			[
				{
					type: "insert-block",
					blockId: "b2",
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "user" },
		);
		expect(readAllSuggestions(editor)).toHaveLength(2);

		acceptAllSuggestions(editor);
		expect(readAllSuggestions(editor)).toEqual([]);

		expect(editor.undoManager.undo()).toBe(true);
		expect(readAllSuggestions(editor)).toHaveLength(2);
		expect(editor.undoManager.undo()).toBe(true);

		editor.destroy();
	});

	it("AIB4: a single suggestion accept is one undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({ author: "tester" }),
			],
		});
		const blockId = editor.firstBlock()!.id;
		applySuggestedAIOperations(editor, {
			operations: [
				{ type: "insert-text", blockId, offset: 0, text: "Hello" },
			],
			suggestionIds: ["suggestion-insert"],
		});
		const [suggestion] = readAllSuggestions(editor);
		expect(suggestion).toBeDefined();
		expect(acceptSuggestion(editor, suggestion!.id)).toBe(true);
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello");

		expect(editor.undoManager.undo()).toBe(true);
		expect(readAllSuggestions(editor)).toHaveLength(1);

		editor.destroy();
	});
});
