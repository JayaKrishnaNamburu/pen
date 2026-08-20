import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	aiExtension,
	buildStructuralReviewItems,
	defaultAICommands,
	getAIController,
} from "../index";

describe("AI command catalog (LOC1)", () => {
	it("LOC1: default command bindings store catalog keys, not English literals", () => {
		const rewrite = defaultAICommands.find((command) => command.id === "ai:rewrite");
		expect(rewrite?.label).toBe("pen.ai.command.rewrite");
		expect(rewrite?.description).toBe("pen.ai.command.rewrite.description");
	});

	it("LOC1: getCommands resolves default labels from the English catalog", () => {
		const editor = createEditor({
			extensions: [aiExtension()],
		});
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();

		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "user" },
		);
		editor.selectText(blockId, 0, 5);
		const rewrite = controller
			?.getCommands()
			.find((command) => command.id === "ai:rewrite");
		expect(rewrite?.label).toBe("Rewrite");
		expect(rewrite?.description).toBe("Rewrite the selected text");

		editor.selectText(blockId, 5, 5);
		const continueCommand = controller
			?.getCommands()
			.find((command) => command.id === "ai:continue");
		expect(continueCommand?.label).toBe("Continue writing");
		expect(continueCommand?.description).toBe(
			"Continue writing from the current position",
		);

		editor.destroy();
	});

	it("LOC1: host messages override default command labels", () => {
		const editor = createEditor({
			extensions: [aiExtension()],
			messages: {
				"pen.ai.command.rewrite": "Umschreiben",
				"pen.ai.command.continue": "Weiter schreiben",
			},
		});
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();

		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "user" },
		);
		editor.selectText(blockId, 0, 5);
		const rewrite = controller
			?.getCommands()
			.find((command) => command.id === "ai:rewrite");
		expect(rewrite?.label).toBe("Umschreiben");
		expect(rewrite?.description).toBe("Rewrite the selected text");

		editor.selectText(blockId, 5, 5);
		const continueCommand = controller
			?.getCommands()
			.find((command) => command.id === "ai:continue");
		expect(continueCommand?.label).toBe("Weiter schreiben");

		editor.destroy();
	});

	it("LOC1: review artifacts resolve through the catalog", () => {
		const editor = createEditor({
			messages: {
				"pen.ai.review.replaceText": "Text ersetzen",
			},
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello world" }],
			{ origin: "system" },
		);

		const items = buildStructuralReviewItems(editor, {
			kind: "text_edit",
			target: {
				blockId,
				range: {
					startOffset: 6,
					endOffset: 11,
				},
			},
			operation: "replace",
			text: "planet",
		});

		expect(items[0]?.label).toBe("Text ersetzen");
		expect(items[0]?.groupLabel).toBe(`Block "${blockId}"`);
		editor.destroy();
	});
});
