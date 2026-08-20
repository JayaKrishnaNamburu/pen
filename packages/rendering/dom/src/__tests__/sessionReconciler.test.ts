import { createHeadlessEditor } from "@input/pen-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionReconciler } from "../field-editor/sessionReconciler";

describe("SessionReconciler", () => {
	beforeEach(() => {
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
		vi.stubGlobal("cancelAnimationFrame", () => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("does not reconcile the focus block after a user commit", () => {
		const editor = createHeadlessEditor();
		const blockId = editor.firstBlock()!.id;
		const getYText = vi.fn(() => null);
		const reconciler = createReconciler(editor, blockId, getYText);

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "a",
			},
		]);

		expect(getYText).not.toHaveBeenCalled();
		reconciler.destroy();
		editor.destroy();
	});

	it("reconciles the focus block after a structured history commit", () => {
		const editor = createHeadlessEditor();
		const blockId = editor.firstBlock()!.id;
		const getYText = vi.fn(() => null);
		const reconciler = createReconciler(editor, blockId, getYText);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "a",
				},
			],
			{ origin: { type: "history", source: "undo" } },
		);

		expect(getYText).toHaveBeenCalledWith(blockId);
		reconciler.destroy();
		editor.destroy();
	});
});

function createReconciler(
	editor: ReturnType<typeof createHeadlessEditor>,
	blockId: string,
	getYText: () => null,
) {
	return new SessionReconciler(editor, {
		getSnapshot: () => ({
			focusBlockId: blockId,
			activeBlockIds: [blockId],
			isEditing: true,
			mode: "single",
		}),
		getAttachedElement: () => null,
		getInlineElement: () => null,
		getYText,
		shouldPreserveSelection: () => false,
		shouldProjectSelection: () => false,
		projectSelection: () => {},
	});
}
