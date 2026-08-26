import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";

import { undoExtension } from "../undoExtension";

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("@input/pen-undo ST4 stream grouping", () => {
	it("ST4: stream commits share groupId and undo as one unit", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension()],
		});
		const blockId = editor.firstBlock()!.id;
		const writer = editor.openTextStream(
			{ blockId },
			{ origin: { type: "ai", groupId: "undo-stream" } },
		);

		writer.append("hello");
		writer.flush();
		writer.append("!");
		writer.flush();
		writer.close();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello!",
		);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");
		expect(editor.undoManager.undo()).toBe(false);

		editor.destroy();
	});
});
