import { describe, expect, it } from "vitest";

import { deleteBackward, deleteForward, insertText } from "..";
import {
	caretOf,
	createCommandEditor,
	liveRegistry,
} from "./fixture";

/**
 * N2 mixed-boundary delete.
 *
 * The live Backspace keystroke for a multi-block text selection is
 * captured by `handleDeleteSelectionShortcut` → `editor.deleteSelection()`
 * (`deleteMultiBlockTextRange`): keep the paragraph prefix, delete the
 * divider, leave the caret at the cut. Escalating that selection onto
 * `selectBlock([p1, d1])` deletes the entire paragraph — that is the
 * wrong product (owner 2026-08-23).
 *
 * `pen.deleteBackward` is the path the keymap and beforeinput already
 * use for every other delete, and the path the interceptor is specified
 * to fold onto. A `deleteSelection()`-only test on `p1@2 → d1@1` stays
 * green while a reversed structural-start range still merge-blocks.
 * The following paragraph is load-bearing: a p1+d1 fixture cannot fail
 * an assertion that the rest of the document survived.
 */
function mixedBoundaryDoc() {
	return createCommandEditor([
		{ id: "p1", type: "paragraph", text: "Hello" },
		{ id: "d1", type: "divider" },
		{ id: "p2", type: "paragraph", text: "World" },
	]);
}

function expectPrefixKept(
	editor: ReturnType<typeof mixedBoundaryDoc>,
): void {
	expect(editor.getBlock("p1")?.textContent()).toBe("He");
	expect(editor.getBlock("d1")).toBeNull();
	expect(editor.getBlock("p2")?.textContent()).toBe("World");
	expect(caretOf(editor)).toEqual({ blockId: "p1", offset: 2 });
}

describe("N2 mixed-boundary delete", () => {
	it("N2: live registry Backspace keeps the paragraph prefix and deletes the divider", () => {
		const editor = mixedBoundaryDoc();
		const registry = liveRegistry(editor);
		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "d1", offset: 1 },
		);
		expect(editor.selection?.type).toBe("text");

		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expectPrefixKept(editor);
		editor.destroy();
	});

	it("N2: live registry Delete matches Backspace on a mixed-boundary text selection", () => {
		const editor = mixedBoundaryDoc();
		const registry = liveRegistry(editor);
		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "d1", offset: 1 },
		);

		expect(
			registry.dispatch(deleteForward, { granularity: "grapheme" }),
		).toBe(true);
		expectPrefixKept(editor);
		editor.destroy();
	});

	it("N2: a reversed mixed-boundary range (divider → paragraph) keeps the suffix", () => {
		const editor = mixedBoundaryDoc();
		const registry = liveRegistry(editor);
		editor.selectTextRange(
			{ blockId: "d1", offset: 0 },
			{ blockId: "p2", offset: 2 },
		);
		expect(editor.selection?.type).toBe("text");

		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expect(editor.getBlock("p1")?.textContent()).toBe("Hello");
		expect(editor.getBlock("d1")).toBeNull();
		expect(editor.getBlock("p2")?.textContent()).toBe("rld");
		expect(caretOf(editor)).toEqual({ blockId: "p2", offset: 0 });
		editor.destroy();
	});

	it("N2: insertText over a mixed-boundary range replaces the suffix-plus-divider, not the paragraph", () => {
		const editor = mixedBoundaryDoc();
		const registry = liveRegistry(editor);
		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "d1", offset: 1 },
		);

		expect(registry.dispatch(insertText, { text: "X" })).toBe(true);
		expect(editor.getBlock("p1")?.textContent()).toBe("HeX");
		expect(editor.getBlock("d1")).toBeNull();
		expect(editor.getBlock("p2")?.textContent()).toBe("World");
		expect(caretOf(editor)).toEqual({ blockId: "p1", offset: 3 });
		editor.destroy();
	});

	it("N2: deleteSelection on a pointer-shaped mixed range (d1@0) keeps the prefix", () => {
		const editor = mixedBoundaryDoc();
		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "d1", offset: 0 },
		);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: "p1", offset: 2 },
			focus: { blockId: "d1", offset: 1 },
		});
		editor.deleteSelection();
		expectPrefixKept(editor);
		editor.destroy();
	});

	it("N2: text-to-text across a middle divider still merges the text ends", () => {
		const editor = mixedBoundaryDoc();
		const registry = liveRegistry(editor);
		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "p2", offset: 2 },
		);

		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);
		expect(editor.getBlock("p1")?.textContent()).toBe("Herld");
		expect(editor.getBlock("d1")).toBeNull();
		expect(editor.getBlock("p2")).toBeNull();
		expect(caretOf(editor)).toEqual({ blockId: "p1", offset: 2 });
		editor.destroy();
	});
});
