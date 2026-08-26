import { describe, expect, it } from "vitest";

import {
	caretDown,
	caretLeft,
	caretRight,
	caretUp,
	convertBlock,
	deleteBackward,
	deleteBlock,
	duplicateBlock,
	indent,
	insertText,
	moveBlockDown,
	outdent,
	splitBlock,
	toggleMark,
} from "..";
import { caretOf, createCommandEditor, liveRegistry } from "./fixture";

function blockOrder(editor: ReturnType<typeof createCommandEditor>): string[] {
	return [...editor.documentState.blockOrder];
}

/**
 * Family migrations use the registry `createEditor` installed, not
 * `createCommandHarness`. Wrapping `dispatch` proves the live path is the
 * one that mutates; a fallback that never goes through this function cannot
 * make the test pass.
 */
function wrapDispatch(editor: ReturnType<typeof createCommandEditor>) {
	const registry = liveRegistry(editor);
	const original = registry.dispatch.bind(registry);
	const commands: string[] = [];
	registry.dispatch = ((command, param, context) => {
		commands.push(command.name);
		return original(command, param, context);
	}) as typeof registry.dispatch;
	return { registry, commands };
}

describe("live registry family migration", () => {
	describe("caret family", () => {
		it("caretLeft/Right and caretUp/Down go through the installed registry", () => {
			const editor = createCommandEditor([
				{ id: "a", type: "paragraph", text: "aa" },
				{ id: "b", type: "paragraph", text: "bbb" },
			]);
			const { registry, commands } = wrapDispatch(editor);
			editor.selectText("a", 1, 1);

			expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			expect(registry.dispatch(caretDown, { extend: false })).toBe(true);
			expect(caretOf(editor)).toEqual({ blockId: "b", offset: 0 });
			expect(registry.dispatch(caretUp, { extend: false })).toBe(true);
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			expect(registry.dispatch(caretLeft, { extend: false })).toBe(true);
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });
			expect(commands).toEqual([
				caretRight.name,
				caretDown.name,
				caretUp.name,
				caretLeft.name,
			]);
			editor.destroy();
		});
	});

	describe("text family", () => {
		it("insert, delete, split, indent, and toggleMark go through the installed registry", () => {
			const editor = createCommandEditor([
				{ id: "a", type: "bulletListItem", text: "one" },
				{ id: "b", type: "bulletListItem", text: "hello" },
			]);
			const { registry, commands } = wrapDispatch(editor);
			editor.selectText("b", 5, 5);

			expect(registry.dispatch(insertText, { text: "!" })).toBe(true);
			expect(editor.getBlock("b")?.textContent()).toBe("hello!");

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(editor.getBlock("b")?.textContent()).toBe("hello");

			editor.selectText("b", 0, 5);
			expect(registry.dispatch(toggleMark, { mark: "bold" })).toBe(true);
			expect(editor.getBlock("b")?.textDeltas()).toEqual([
				{ insert: "hello", attributes: { bold: true } },
			]);

			editor.selectText("b", 2, 2);
			expect(registry.dispatch(splitBlock, undefined)).toBe(true);
			const next = caretOf(editor);
			expect(editor.getBlock("b")?.textContent()).toBe("he");
			expect(editor.getBlock(next.blockId)?.textContent()).toBe("llo");
			expect(editor.getBlock(next.blockId)?.type).toBe("bulletListItem");

			editor.selectText("b", 0, 0);
			expect(registry.dispatch(indent, undefined)).toBe(true);
			expect(editor.getBlock("b")?.props.indent).toBe(1);
			expect(registry.dispatch(outdent, undefined)).toBe(true);
			expect(editor.getBlock("b")?.props.indent).toBe(0);

			expect(commands).toEqual([
				insertText.name,
				deleteBackward.name,
				toggleMark.name,
				splitBlock.name,
				indent.name,
				outdent.name,
			]);
			editor.destroy();
		});

		it("bare createEditor() toggleMark bold/italic formats a selected range", () => {
			const editor = createCommandEditor([
				{ id: "a", type: "paragraph", text: "hello" },
			]);
			const registry = liveRegistry(editor);
			editor.selectText("a", 0, 5);

			expect(registry.dispatch(toggleMark, { mark: "bold" })).toBe(true);
			expect(editor.getBlock("a")?.textDeltas()).toEqual([
				{ insert: "hello", attributes: { bold: true } },
			]);
			expect(registry.dispatch(toggleMark, { mark: "italic" })).toBe(
				true,
			);
			expect(editor.getBlock("a")?.textDeltas()).toEqual([
				{ insert: "hello", attributes: { bold: true, italic: true } },
			]);

			editor.selectText("a", 5, 5);
			expect(registry.dispatch(toggleMark, { mark: "bold" })).toBe(false);
			editor.destroy();
		});
	});

	describe("structure family", () => {
		it("move, duplicate, delete, and convert go through the installed registry", () => {
			const editor = createCommandEditor([
				{ id: "a", type: "paragraph", text: "one" },
				{ id: "b", type: "paragraph", text: "two" },
				{ id: "c", type: "paragraph", text: "three" },
			]);
			const { registry, commands } = wrapDispatch(editor);
			editor.selectText("a", 1, 1);

			expect(registry.dispatch(moveBlockDown, {})).toBe(true);
			expect(blockOrder(editor)).toEqual(["b", "a", "c"]);

			expect(registry.dispatch(duplicateBlock, {})).toBe(true);
			const afterDuplicate = blockOrder(editor);
			expect(afterDuplicate).toHaveLength(4);
			expect(afterDuplicate[0]).toBe("b");
			expect(afterDuplicate[1]).toBe("a");
			const copyId = afterDuplicate[2]!;
			expect(editor.getBlock(copyId)?.textContent()).toBe("one");

			expect(registry.dispatch(deleteBlock, {})).toBe(true);
			expect(editor.getBlock(copyId)).toBeNull();
			expect(blockOrder(editor)).toEqual(["b", "a", "c"]);

			editor.selectText("a", 0, 0);
			expect(
				registry.dispatch(convertBlock, {
					blockId: "a",
					newType: "heading",
					newProps: { level: 2 },
				}),
			).toBe(true);
			expect(editor.getBlock("a")?.type).toBe("heading");

			expect(commands).toEqual([
				moveBlockDown.name,
				duplicateBlock.name,
				deleteBlock.name,
				convertBlock.name,
			]);
			editor.destroy();
		});
	});
});
