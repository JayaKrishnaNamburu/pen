import { describe, expect, it } from "vitest";

import {
	deleteAdjacentInlineAtom,
	deleteBackward,
	deleteForward,
	selectAdjacentInlineAtom,
} from "..";
import { isCollapsed } from "../../selection/helpers";
import {
	caretOf,
	createCommandEditor,
	createCommandHarness,
	insertMention,
	liveRegistry,
} from "./fixture";

/**
 * Owner-approved UX: first Backspace / Delete next to an inline atom
 * SELECTs it (`selectAdjacentInlineAtom`). Second press deletes it through
 * the ordinary non-collapsed `handleDelete` path (`replaceRangeOps`), not
 * a second atom-specific step.
 *
 * `deleteAdjacentInlineAtom` remains as a helper that still returns a
 * one-shot delete. The live registry no longer calls it.
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
	expect(isCollapsed(editor.selection)).toBe(false);
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

describe("inline atom delete select-then-delete", () => {
	describe("selectAdjacentInlineAtom", () => {
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
					anchor: { blockId: "a", offset: 2 },
					focus: { blockId: "a", offset: 3 },
				}),
			);
			expect(
				editor
					.getBlock("a")
					?.inlineDeltas()
					?.some((delta) => {
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

	describe("registry live path (select then delete)", () => {
		it("dispatch deleteBackward adjacent to an atom selects it on the first step", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 3, 3);
			expect(hasMention(editor)).toBe(true);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(true);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expectAtomSelected(editor);
			editor.destroy();
		});

		it("liveRegistry deleteBackward adjacent to an atom selects it on the first step", () => {
			const editor = mentionDoc();
			const registry = liveRegistry(editor);
			editor.selectText("a", 3, 3);
			expect(hasMention(editor)).toBe(true);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(true);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expectAtomSelected(editor);
			editor.destroy();
		});

		it("dispatch deleteForward adjacent to an atom selects it on the first step", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 2, 2);
			expect(hasMention(editor)).toBe(true);

			expect(
				registry.dispatch(deleteForward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(true);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expectAtomSelected(editor);
			editor.destroy();
		});

		it("second deleteBackward after select removes the atom through selection-delete", () => {
			const editor = mentionDoc();
			const registry = createCommandHarness(editor);
			editor.selectText("a", 3, 3);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expectAtomSelected(editor);

			expect(
				registry.dispatch(deleteBackward, { granularity: "grapheme" }),
			).toBe(true);
			expect(hasMention(editor)).toBe(false);
			expect(editor.getBlock("a")?.textContent()).toBe("hiz");
			expect(caretOf(editor)).toEqual({ blockId: "a", offset: 2 });
			editor.destroy();
		});

		it("deleteAdjacentInlineAtom still returns the delete-text op without selecting", () => {
			const editor = mentionDoc();
			editor.selectText("a", 3, 3);

			const oneShot = deleteAdjacentInlineAtom(editor, "backward");
			expect(oneShot).toEqual({
				ops: [
					{
						type: "splice-text",
						blockId: "a",
						from: 2,
						to: 2 + 1,
						insert: "",
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

	it("live dispatch and selectAdjacentInlineAtom are the same product", () => {
		const selectEditor = mentionDoc();
		const liveEditor = mentionDoc();
		selectEditor.selectText("a", 3, 3);
		liveEditor.selectText("a", 3, 3);

		const selected = selectAdjacentInlineAtom(selectEditor, "backward");
		const registry = createCommandHarness(liveEditor);
		expect(
			registry.dispatch(deleteBackward, { granularity: "grapheme" }),
		).toBe(true);

		expect(selected).toEqual(
			expect.objectContaining({
				type: "text",
				anchor: { blockId: "a", offset: 2 },
				focus: { blockId: "a", offset: 3 },
			}),
		);
		expectAtomSelected(liveEditor);
		expect(hasMention(selectEditor)).toBe(true);
		expect(hasMention(liveEditor)).toBe(true);
		selectEditor.destroy();
		liveEditor.destroy();
	});
});
