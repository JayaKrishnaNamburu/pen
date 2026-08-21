import { describe, expect, it } from "vitest";

import {
	caretDown,
	caretUp,
	createEditor,
	getCommandRegistry,
	insertText,
} from "../../index";
import { defaultSchema } from "../../__tests__/fixtures/testSchema";

describe("command registry public API reachability", () => {
	it("createEditor wires builtin handlers so insertText mutates the document", () => {
		const editor = createEditor({ schema: defaultSchema });
		const registry = getCommandRegistry(editor);
		expect(registry).toBeDefined();

		const block = editor.firstBlock()!;
		editor.selectText(block.id, 0, 0);
		expect(registry!.dispatch(insertText, { text: "Hi" })).toBe(true);
		expect(editor.getBlock(block.id)?.textContent()).toBe("Hi");
		editor.destroy();
	});

	it("pen.caretUp and pen.caretDown stay a miss until the geometry seam exists", () => {
		const editor = createEditor({ schema: defaultSchema });
		const registry = getCommandRegistry(editor);
		const block = editor.firstBlock()!;
		editor.selectText(block.id, 0, 0);

		expect(registry!.dispatch(caretUp, { extend: false })).toBe(false);
		expect(registry!.dispatch(caretDown, { extend: false })).toBe(false);
		expect(registry!.diagnostics).toEqual([]);
		editor.destroy();
	});
});
