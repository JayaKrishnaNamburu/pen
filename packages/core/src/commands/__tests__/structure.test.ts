import { describe, expect, it } from "vitest";

import {
	deleteBlock,
	duplicateBlock,
	moveBlockDown,
	moveBlockUp,
} from "..";
import { caretOf, createCommandEditor, createCommandHarness } from "./fixture";

function blockOrder(editor: ReturnType<typeof createCommandEditor>): string[] {
	return [...editor.documentState.blockOrder];
}

describe("structure commands", () => {
	it("moving the first block up is a no-op rather than an error", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "one" },
			{ id: "b", type: "paragraph", text: "two" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 0, 0);

		expect(registry.dispatch(moveBlockUp, {})).toBe(false);
		expect(blockOrder(editor)).toEqual(["a", "b"]);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		editor.destroy();
	});

	it("moveBlockDown swaps with the next sibling and keeps selection on the moved block", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "one" },
			{ id: "b", type: "paragraph", text: "two" },
			{ id: "c", type: "paragraph", text: "three" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 1, 1);

		expect(registry.dispatch(moveBlockDown, {})).toBe(true);
		expect(blockOrder(editor)).toEqual(["b", "a", "c"]);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });
		editor.destroy();
	});

	it("duplicateBlock produces a new block id after the original", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
			{ id: "b", type: "paragraph", text: "world" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(duplicateBlock, {})).toBe(true);
		const order = blockOrder(editor);
		expect(order).toHaveLength(3);
		expect(order[0]).toBe("a");
		expect(order[2]).toBe("b");
		const copyId = order[1]!;
		expect(copyId).not.toBe("a");
		expect(editor.getBlock(copyId)?.textContent()).toBe("hello");
		expect(editor.getBlock("a")?.textContent()).toBe("hello");
		expect(caretOf(editor)).toEqual({ blockId: copyId, offset: 0 });
		editor.destroy();
	});

	it("deleting the only block leaves a valid document and a valid selection", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "only" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(deleteBlock, {})).toBe(true);
		expect(editor.getBlock("a")).toBeNull();
		expect(blockOrder(editor)).toHaveLength(1);
		const remainingId = blockOrder(editor)[0]!;
		expect(remainingId).not.toBe("a");
		expect(editor.getBlock(remainingId)?.type).toBe("paragraph");
		expect(editor.getBlock(remainingId)?.textContent()).toBe("");
		expect(caretOf(editor)).toEqual({ blockId: remainingId, offset: 0 });
		editor.destroy();
	});

	it("deleteBlock of one of several lands on the previous neighbor", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "one" },
			{ id: "b", type: "paragraph", text: "two" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("b", 1, 1);

		expect(registry.dispatch(deleteBlock, {})).toBe(true);
		expect(editor.getBlock("b")).toBeNull();
		expect(blockOrder(editor)).toEqual(["a"]);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 3 });
		editor.destroy();
	});
});
