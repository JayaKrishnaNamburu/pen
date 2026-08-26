import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";

import { undoExtension } from "../undoExtension";

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("@input/pen-undo maxDepth", () => {
	it("CH7: undoExtension({ maxDepth: 2 }) drops the oldest user edit", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension({ groupTimeout: 0, maxDepth: 2 })],
		});
		const blockId = editor.firstBlock()!.id;

		for (const letter of ["a", "b", "c"]) {
			editor.apply(
				[
					{
						type: "splice-text",
						blockId,
						from: editor.getBlock(blockId)!.length(),
				to: editor.getBlock(blockId)!.length(),
				insert: letter,
					},
				],
				{ origin: "user" },
			);
		}
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("abc");

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("ab");
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("a");
		expect(editor.undoManager.canUndo()).toBe(false);
		expect(editor.undoManager.undo()).toBe(false);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("a");

		editor.destroy();
	});
});
