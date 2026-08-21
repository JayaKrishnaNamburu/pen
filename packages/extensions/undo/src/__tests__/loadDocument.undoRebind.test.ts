import { describe, expect, it } from "vitest";

import {
	BODY_ID,
	BODY_TEXT,
	TITLE_ID,
	TITLE_TEXT,
	createUndoEditor,
	snapshot,
} from "./undoEditorFixture";

describe("@input/pen-undo loadDocument rebind", () => {
	it("rebinds undo so a post-load user edit restores the new document", async () => {
		const loaded = createUndoEditor();
		const replacement = createUndoEditor();
		const { adapter, editor } = loaded;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: BODY_ID,
					offset: BODY_TEXT.length,
					text: " before-load",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(BODY_ID)?.textContent()).toBe(
			`${BODY_TEXT} before-load`,
		);

		editor.loadDocument(
			adapter.loadDocument(
				adapter.encodeState(replacement.editor.internals.crdtDoc),
			),
		);
		await editor.whenReady();

		const prior = snapshot(editor);
		expect(prior).toEqual([
			{ id: TITLE_ID, text: TITLE_TEXT },
			{ id: BODY_ID, text: BODY_TEXT },
		]);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: BODY_ID,
					offset: BODY_TEXT.length,
					text: " after-load",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock(BODY_ID)?.textContent()).toBe(
			`${BODY_TEXT} after-load`,
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(snapshot(editor)).toEqual(prior);
		expect(editor.getBlock(BODY_ID)?.textContent()).toBe(BODY_TEXT);
		expect(editor.undoManager.canUndo()).toBe(false);

		editor.destroy();
		replacement.editor.destroy();
	});
});
