import { describe, expect, it } from "vitest";

import {
	deleteAdjacentInlineAtom,
	deleteBackward,
	deleteForward,
	selectAdjacentInlineAtom,
} from "..";
import {
	caretOf,
	createCommandEditor,
	createCommandHarness,
	insertMention,
} from "./fixture";

/**
 * Unresolved product fork, pinned so it cannot be lost by retargeting tests.
 *
 * Field-editor `applyDeleteBehavior` SELECTs an adjacent inline atom
 * (`getInlineNodeSelectionTarget`). The core registry DELETES it
 * (`deleteAdjacentInlineAtom`). Both are defensible. They are not the same
 * product. `registry.dispatch(deleteBackward)` currently keeps the registry
 * one-shot so this file does not silently pick a winner.
 *
 * Recommendation (not applied): SELECT is the correct default.
 *
 * 1. Spec 4.2 says `pen.deleteBackward/Forward` is v1 `applyDeleteBehavior`
 *    moved. That function selects. Immediate delete is a rewrite, not a move.
 * 2. Live editor today selects — field-editor is still the keydown path.
 *    Shipping registry.delete as the replacement would change what users do.
 * 3. Caret already selects a `selectable` atom (N1 / `pen.caretLeft/Right`).
 *    Select-then-delete is one two-step object: first stroke names it, second
 *    removes it. Immediate delete makes atoms feel like invisible characters
 *    on Backspace and like chips on Arrow — two products in one editor.
 * 4. Word / Notion / Google Docs use the two-step for mentions and similar
 *    embeds. Immediate delete is closer to a code editor.
 *
 * Flipping the handler is one call: `selectAdjacentInlineAtom` instead of
 * `deleteAdjacentInlineAtom`. Do not retarget field-editor delete tests onto
 * `registry.dispatch` until an owner confirms this recommendation.
 */

function mentionDoc() {
	const editor = createCommandEditor([
		{ id: "a", type: "paragraph", text: "hiz" },
	]);
	insertMention(editor, "a", 2);
	return editor;
}

function expectAtomSelected(editor: ReturnType<typeof mentionDoc>): void {
	expect(editor.selection?.type).toBe("text");
	if (editor.selection?.type !== "text") {
		throw new Error("expected text selection");
	}
	expect(editor.selection.isCollapsed).toBe(false);
	expect(editor.selection.anchor).toEqual({ blockId: "a", offset: 2 });
	expect(editor.selection.focus).toEqual({ blockId: "a", offset: 3 });
}

function hasMention(editor: ReturnType<typeof mentionDoc>): boolean {
	return (editor.getBlock("a")?.inlineDeltas() ?? []).some((delta) => {
		const insert = delta.insert;
		return (
			typeof insert === "object" &&
			insert !== null &&
			"type" in insert &&
			insert.type === "mention"
		);
	});
}

describe("inline atom delete divergence", () => {
	describe("field-editor / v1 applyDeleteBehavior (select)", () => {
		it("selectAdjacentInlineAtom backward selects the atom and does not mutate", () => {
			const editor = mentionDoc();
			editor.selectText("a", 3, 3);

			const selected = selectAdjacentInlineAtom(editor, "backward");
			expect(selected).not.toBeNull();
			if (selected && selected.type === "text") {
				editor.selectTextRange(selected.anchor, selected.focus);
			}
			expectAtomSelected(editor);
			expect(editor.getBlock("a")?.inlineDeltas()).toEqual([
				{ insert: "hi" },
				{
					insert: {
						type: "mention",
						props: { id: "1", label: "Ada" },
					},
				},
				{ insert: "z" },
			]);
			editor.destroy();
		});

		it("selectAdjacentInlineAtom forward selects the atom and does not mutate", () => {
			const editor = mentionDoc();
			editor.selectText("a", 2, 2);

			const selected = selectAdjacentInlineAtom(editor, "forward");
			expect(selected).toEqual(
				expect.objectContaining({
					type: "text",
					isCollapsed: false,
					anchor: { blockId: "a", offset: 2 },
					focus: { blockId: "a", offset: 3 },
				}),
			);
			expect(
				editor.getBlock("a")?.inlineDeltas()?.some((delta) => {
					const insert = delta.insert;
					return (
						typeof insert === "object" &&
						insert !== null &&
						"type" in insert &&
						insert.type === "mention"
					);
				}),
			).toBe(true);
			editor.destroy();
		});

		it("a selected atom then deleteBackward removes it (second step)", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 2, 3);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(false);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			editor.destroy();
		});
	});

	describe("registry one-shot (delete)", () => {
		it("dispatch deleteBackward adjacent to an atom deletes it in one step", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 3, 3);
			expect(hasMention(editor)).toBe(true);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(false);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			editor.destroy();
		});

		it("dispatch deleteForward adjacent to an atom deletes it in one step", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 2, 2);
			expect(hasMention(editor)).toBe(true);

			expect(
				registry.dispatch(deleteForward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(false);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			editor.destroy();
		});

		it("deleteAdjacentInlineAtom returns the delete-text op without selecting", () => {
			const editor = mentionDoc();
			editor.selectText("a", 3, 3);

			const oneShot = deleteAdjacentInlineAtom(editor, "backward");
			expect(oneShot).toEqual({
				ops: [
					{
						type: "delete-text",
						blockId: "a",
						offset: 2,
						length: 1,
					},
				],
				caret: { blockId: "a", offset: 2 },
			});
			expect(hasMention(editor)).toBe(true);
			editor.apply(oneShot!.ops, { origin: "user" });
			expect(hasMention(editor)).toBe(false);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			editor.destroy();
		});
	});

	it("select vs delete are different products on the same fixture", () => {
		const selectEditor = mentionDoc();
		const deleteEditor = mentionDoc();
		selectEditor.selectText("a", 3, 3);
		deleteEditor.selectText("a", 3, 3);

		const selected = selectAdjacentInlineAtom(selectEditor, "backward");
		const oneShot = deleteAdjacentInlineAtom(deleteEditor, "backward");

		expect(selected).toEqual(
			expect.objectContaining({
				type: "text",
				isCollapsed: false,
				anchor: { blockId: "a", offset: 2 },
				focus: { blockId: "a", offset: 3 },
			}),
		);
		expect(oneShot).toEqual({
			ops: [
				{
					type: "delete-text",
					blockId: "a",
					offset: 2,
					length: 1,
				},
			],
			caret: { blockId: "a", offset: 2 },
		});
		expect(selected).not.toEqual(oneShot);
		expect(hasMention(selectEditor)).toBe(true);
		expect(hasMention(deleteEditor)).toBe(true);
		selectEditor.destroy();
		deleteEditor.destroy();
	});
});
