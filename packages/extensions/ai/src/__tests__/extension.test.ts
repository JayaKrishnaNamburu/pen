import { createEditor } from "@input/pen-core";
import { AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY } from "@input/pen-types";
import { describe, expect, it } from "vitest";
import { defaultSchema } from "@input/pen-schema-default";
import {
	AI_CONTROLLER_SLOT,
	AI_EXTENSION_NAME,
	AI_INLINE_HISTORY_SLOT,
	AI_REVIEW_CONTROLLER_SLOT,
	aiExtension,
	getAIController,
	getAIInlineHistoryController,
	getAIReviewController,
} from "../index";

async function awaitExtensionLifecycle(editor: ReturnType<typeof createEditor>) {
	await (editor.internals.getSlot<() => Promise<void>>(
		AWAIT_EXTENSION_LIFECYCLE_SLOT_KEY,
	)?.() ?? Promise.resolve());
}

describe("aiExtension", () => {
	it("CH3 creates a named extension and activates controller slots", () => {
		const extension = aiExtension({ author: "tester" });
		expect(extension.name).toBe(AI_EXTENSION_NAME);
		expect(extension.dependencies).toEqual([
			"document-ops",
			"delta-stream",
			"undo",
		]);

		const editor = createEditor({ schema: defaultSchema,  extensions: [extension] });
		const controller = getAIController(editor);

		expect(controller).toBeTruthy();
		expect(getAIInlineHistoryController(editor)).toBeTruthy();
		expect(getAIReviewController(editor)).toBeTruthy();
		expect(editor.internals.getSlot(AI_CONTROLLER_SLOT)).toBe(controller);
		expect(editor.internals.getSlot(AI_INLINE_HISTORY_SLOT)).toBeTruthy();
		expect(editor.internals.getSlot(AI_REVIEW_CONTROLLER_SLOT)).toBeTruthy();
		expect(controller!.getState().suggestMode).toBe(false);
	});

	it("CH3 clears controller slots when the extension deactivates", async () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension()],
		});
		expect(getAIController(editor)).toBeTruthy();

		editor.destroy();
		await awaitExtensionLifecycle(editor);

		expect(getAIController(editor)).toBeNull();
		expect(getAIInlineHistoryController(editor)).toBeNull();
		expect(getAIReviewController(editor)).toBeNull();
	});

	it("CH3 intercepts user apply through the suggest-mode hook", () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension({ suggestMode: true, author: "tester" })],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "user" },
		);

		const deltas = editor.getBlock(blockId)!.textDeltas();
		expect(deltas[0]?.attributes?.suggestion).toMatchObject({
			action: "insert",
			author: "tester",
		});
		expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
			"Hello",
		);
	});

	it("ST1: suggest-mode beforeApply keeps stream-open so a writer can flush", () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension({ suggestMode: true, author: "tester" })],
		});
		const blockId = editor.firstBlock()!.id;

		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "st1-suggest" } },
		);
		writer.append("streamed");
		writer.flush();
		writer.close();

		expect(editor.getBlock(blockId)!.textContent({ resolved: true })).toBe(
			"streamed",
		);
	});

	it("CH4 installs controller methods on the instance, not the prototype", () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension()],
		});
		const controller = getAIController(editor);
		expect(controller).toBeTruthy();
		expect(typeof controller!.acceptActiveGeneration).toBe("function");
		expect(
			Object.hasOwn(
				Object.getPrototypeOf(controller),
				"acceptActiveGeneration",
			),
		).toBe(false);
	});

	it("CH3 bypasses the suggest-mode hook for system origin", () => {
		const editor = createEditor({
			schema: defaultSchema,extensions: [aiExtension({ suggestMode: true, author: "tester" })],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "Hello" }],
			{ origin: "system" },
		);

		const deltas = editor.getBlock(blockId)!.textDeltas();
		expect(deltas[0]?.attributes?.suggestion).toBeUndefined();
		expect(editor.getBlock(blockId)!.textContent()).toBe("Hello");
	});
});
