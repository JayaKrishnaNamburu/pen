import { createEditor, getOpOriginType } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";

import { undoExtension } from "../undoExtension";

function createEditorWithUndo() {
	return createEditor({
		schema: defaultSchema,
		extensions: [undoExtension()],
	});
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("@input/pen-undo import and history origins", () => {
	it("tracks imported edits in the undo stack", () => {
		const editor = createEditorWithUndo();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Imported text",
				},
			],
			{ origin: "import", undoGroup: true },
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"Imported text",
		);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		editor.destroy();
	});

	it("emits history origin for undo transactions on documentCommit", () => {
		const editor = createEditorWithUndo();
		const blockId = editor.firstBlock()!.id;
		const commitOrigins: string[] = [];

		editor.on("documentCommit", (event) => {
			commitOrigins.push(getOpOriginType(event.origin));
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hello",
			},
		]);

		editor.undoManager.undo();

		expect(commitOrigins).toContain("user");
		expect(commitOrigins).toContain("history");

		editor.destroy();
	});
});
