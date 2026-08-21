import { describe, expect, it } from "vitest";

import {
	caretBlockEnd,
	caretBlockStart,
	caretDocEnd,
	caretDocStart,
	caretDown,
	caretLeft,
	caretLineEnd,
	caretLineStart,
	caretRight,
	caretUp,
	caretWordLeft,
	caretWordRight,
	selectAll,
	selectBlock,
	setVerticalCaretMeasure,
	getVerticalCaretGoalX,
} from "..";
import {
	caretOf,
	createCommandEditor,
	createCommandHarness,
	insertMention,
} from "./fixture";

describe("caret commands", () => {
	it("T4: caretLeft/Right step by grapheme and cross into the next text block", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "ab" },
			{ id: "b", type: "paragraph", text: "cd" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "b", offset: 0 });

		expect(registry.dispatch(caretLeft, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });

		editor.selectText("a", 2, 2);
		expect(registry.dispatch(caretLeft, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 1 });
		editor.destroy();
	});

	it("T4: caretRight at a structural neighbor selects the block", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hi" },
			{ id: "div", type: "divider" },
			{ id: "b", type: "paragraph", text: "yo" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["div"],
		});
		editor.destroy();
	});

	it("caretWordLeft/Right use word boundaries", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello world" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 11, 11);

		expect(registry.dispatch(caretWordLeft, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(6);

		expect(registry.dispatch(caretWordLeft, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(0);

		expect(registry.dispatch(caretWordRight, { extend: false })).toBe(true);
		expect(caretOf(editor).offset).toBe(5);
		editor.destroy();
	});

	it("caretLineStart/End and caretBlockStart/End move to the block edges", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 3, 3);

		expect(registry.dispatch(caretLineStart, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		expect(registry.dispatch(caretLineEnd, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 5 });

		editor.selectText("a", 2, 2);
		expect(registry.dispatch(caretBlockStart, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		expect(registry.dispatch(caretBlockEnd, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 5 });
		editor.destroy();
	});

	it("caretDocStart/End move to the first and last normal positions", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "aa" },
			{ id: "b", type: "paragraph", text: "bbb" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("b", 1, 1);

		expect(registry.dispatch(caretDocStart, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 0 });
		expect(registry.dispatch(caretDocEnd, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "b", offset: 3 });
		editor.destroy();
	});

	it("extend keeps the original anchor", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "abcd" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 1, 1);

		expect(registry.dispatch(caretRight, { extend: true })).toBe(true);
		expect(editor.selection?.type).toBe("text");
		if (editor.selection?.type !== "text") {
			throw new Error("expected text selection");
		}
		expect(editor.selection.anchor).toEqual({ blockId: "a", offset: 1 });
		expect(editor.selection.focus).toEqual({ blockId: "a", offset: 2 });
		editor.destroy();
	});

	it("T1: selectAll escalates from field text to the whole block, then the document", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
			{ id: "b", type: "paragraph", text: "world" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(selectAll, undefined)).toBe(true);
		expect(editor.selection?.type).toBe("text");
		if (editor.selection?.type !== "text") {
			throw new Error("expected text selection");
		}
		expect(editor.selection.anchor).toEqual({ blockId: "a", offset: 0 });
		expect(editor.selection.focus).toEqual({ blockId: "a", offset: 5 });

		expect(registry.dispatch(selectAll, undefined)).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["a", "b"],
		});
		editor.destroy();
	});

	it("N1: caretRight adjacent to a mention selects the atom", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hiz" },
		]);
		insertMention(editor, "a", 2);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretRight, { extend: false })).toBe(true);
		expect(editor.selection?.type).toBe("text");
		if (editor.selection?.type !== "text") {
			throw new Error("expected text selection");
		}
		expect(editor.selection.isCollapsed).toBe(false);
		expect(editor.selection.anchor).toEqual({ blockId: "a", offset: 2 });
		expect(editor.selection.focus).toEqual({ blockId: "a", offset: 3 });
		editor.destroy();
	});

	it("pen.caretUp/Down cross at block edges without geometry", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "aa" },
			{ id: "b", type: "paragraph", text: "bbb" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretDown, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "b", offset: 0 });
		expect(registry.dispatch(caretUp, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
		editor.destroy();
	});

	it("pen.caretUp/Down mid-block miss without geometry", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretUp, { extend: false })).toBe(false);
		expect(registry.dispatch(caretDown, { extend: false })).toBe(false);
		expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
		editor.destroy();
	});

	it("pen.caretDown at a structural neighbor selects the block", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hi" },
			{ id: "div", type: "divider" },
			{ id: "b", type: "paragraph", text: "yo" },
		]);
		const registry = createCommandHarness(editor);
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretDown, { extend: false })).toBe(true);
		expect(editor.selection).toEqual({
			type: "block",
			blockIds: ["div"],
		});
		editor.destroy();
	});

	it("pen.caretUp/Down use the injected geometry measure and persist goalX", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "hello" },
			{ id: "b", type: "paragraph", text: "world" },
		]);
		const registry = createCommandHarness(editor);
		const calls: Array<{
			direction: "up" | "down";
			goalX: number | null;
		}> = [];
		setVerticalCaretMeasure(editor, (_ed, _current, direction, goalX) => {
			calls.push({ direction, goalX });
			return { point: { blockId: "b", offset: 3 }, goalX: goalX ?? 40 };
		});
		editor.selectText("a", 2, 2);

		expect(registry.dispatch(caretDown, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "b", offset: 3 });
		expect(getVerticalCaretGoalX(editor)).toBe(40);
		expect(calls).toEqual([{ direction: "down", goalX: null }]);

		expect(registry.dispatch(caretUp, { extend: false })).toBe(true);
		expect(caretOf(editor)).toEqual({ blockId: "b", offset: 3 });
		expect(calls[1]).toEqual({ direction: "up", goalX: 40 });
		editor.destroy();
	});

	it("pen.selectBlock selects the named block", () => {
		const editor = createCommandEditor([
			{ id: "a", type: "paragraph", text: "a" },
			{ id: "b", type: "paragraph", text: "b" },
		]);
		const registry = createCommandHarness(editor);

		expect(registry.dispatch(selectBlock, { blockId: "b" })).toBe(true);
		expect(editor.selection).toEqual({ type: "block", blockIds: ["b"] });
		expect(registry.dispatch(selectBlock, { blockId: "missing" })).toBe(
			false,
		);
		editor.destroy();
	});
});
