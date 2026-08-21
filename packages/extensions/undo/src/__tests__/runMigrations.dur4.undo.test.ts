import { createEditor, runMigrations, type DocumentMigration } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { Editor } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { undoExtension } from "../undoExtension";

function insertTextMigration(id: string, text: string): DocumentMigration {
	return {
		id,
		run(editor) {
			const blockId = editor.firstBlock()!.id;
			editor.apply([
				{
					type: "insert-text",
					blockId,
					offset: editor.getBlock(blockId)!.length(),
					text,
				},
			]);
		},
	};
}

function visibleText(editor: Editor): string {
	return editor.firstBlock()!.textContent().replace(/\u200B/g, "");
}

describe("@input/pen-undo DUR4 migration origin", () => {
	it("DUR4: migration origin is not undoable with the default undo extension", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "user" }],
			{ origin: "user" },
		);
		expect(editor.undoManager.canUndo()).toBe(true);
		editor.undoManager.undo();
		expect(visibleText(editor)).toBe("");

		const report = runMigrations(editor, [
			insertTextMigration("upgrade", "upgraded"),
		]);

		expect(report.applied).toEqual(["upgrade"]);
		expect(visibleText(editor)).toBe("upgraded");
		expect(editor.undoManager.canUndo()).toBe(false);

		editor.destroy();
	});

	it("DUR4: undo after a user edit and a migration reverts only the user edit", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension({ groupTimeout: 0 })],
		});
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId, offset: 0, text: "user" }],
			{ origin: "user" },
		);

		const report = runMigrations(editor, [
			insertTextMigration("upgrade", "upgraded"),
		]);

		expect(report.applied).toEqual(["upgrade"]);
		expect(visibleText(editor)).toBe("userupgraded");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor)).toBe("upgraded");
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor)).toBe("upgraded");

		editor.destroy();
	});
});
