import { applyMergeBlocks, applySplitBlock } from "@input/pen-core";
import { describe, expect, it } from "vitest";

import { BODY_ID, BODY_TEXT, createUndoEditor, snapshot } from "./undoEditorFixture";

describe("ops undo granularity GATE 4.7", () => {
	it("undo as single steps: split recipe is one undo step", () => {
		const { editor } = createUndoEditor();
		const prior = snapshot(editor);
		applySplitBlock(editor, {
			blockId: BODY_ID,
			offset: 7,
			newBlockId: "body-tail",
			applyOptions: { origin: "user" },
		});
		expect(snapshot(editor)).toEqual([
			prior[0],
			{ id: BODY_ID, text: "Stable " },
			{ id: "body-tail", text: "body text" },
		]);
		expect(editor.undoManager.undo()).toBe(true);
		expect(snapshot(editor)).toEqual(prior);
		expect(editor.getBlock("body-tail")).toBeNull();
		editor.destroy();
	});

	it("undo as single steps: merge recipe is one undo step", () => {
		const { editor } = createUndoEditor();
		applySplitBlock(editor, {
			blockId: BODY_ID,
			offset: 7,
			newBlockId: "body-tail",
			applyOptions: { origin: "user" },
		});
		const afterSplit = snapshot(editor);
		applyMergeBlocks(editor, {
			targetBlockId: BODY_ID,
			sourceBlockId: "body-tail",
			applyOptions: { origin: "user" },
		});
		expect(editor.getBlock(BODY_ID)!.textContent()).toBe(BODY_TEXT);
		expect(editor.getBlock("body-tail")).toBeNull();
		expect(editor.undoManager.undo()).toBe(true);
		expect(snapshot(editor)).toEqual(afterSplit);
		editor.destroy();
	});
});
