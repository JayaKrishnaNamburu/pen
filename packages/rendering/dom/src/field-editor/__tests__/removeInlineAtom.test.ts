import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import {
	getInlineAtomAtOffset,
	removeInlineAtom,
} from "../inlineAtomInteraction";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createUndoEditor(): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
		extensions: [undoExtension()],
	});
}

async function seedAtomAt(
	editor: Editor,
	text: string,
	offset: number,
): Promise<string> {
	await editor.whenReady();
	const blockId = editor.firstBlock()!.id;
	editor.apply(
		[{ type: "splice-text", blockId, from: 0, to: 0, insert: text }],
		{ origin: "user" },
	);
	editor.apply(
		[
			{
				type: "splice-text",
				blockId,
				from: offset,
				to: offset,
				insert: {
					nodeType: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
		],
		{ origin: "user" },
	);
	return blockId;
}

function atomCount(editor: Editor, blockId: string): number {
	return (
		editor
			.getBlock(blockId)
			?.inlineDeltas()
			.filter((delta) => typeof delta.insert !== "string").length ?? 0
	);
}

describe("removeInlineAtom", () => {
	it("removes the atom and leaves surrounding text", async () => {
		const editor = createUndoEditor();
		const blockId = await seedAtomAt(editor, "ab", 1);

		expect(
			removeInlineAtom({
				source: { editor, blockId, offset: 1 },
			}),
		).toBe(true);
		expect(atomCount(editor, blockId)).toBe(0);
		expect(editor.getBlock(blockId)?.textContent()).toBe("ab");
		editor.destroy();
	});

	it("declines a stale offset instead of deleting a character", async () => {
		const editor = createUndoEditor();
		const blockId = await seedAtomAt(editor, "ab", 1);
		const before = editor.getBlock(blockId)?.textContent();

		expect(
			removeInlineAtom({
				source: { editor, blockId, offset: 0 },
			}),
		).toBe(false);
		expect(editor.getBlock(blockId)?.textContent()).toBe(before);
		expect(
			getInlineAtomAtOffset(editor, { blockId, offset: 1 }),
		).not.toBeNull();
		editor.destroy();
	});

	it("undo restores the atom without dropping later typed text", async () => {
		const editor = createUndoEditor();
		const blockId = await seedAtomAt(editor, "hello", 5);
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: "typed ",
				},
			],
			{ origin: "user" },
		);

		expect(
			removeInlineAtom({
				source: { editor, blockId, offset: 11 },
			}),
		).toBe(true);
		expect(atomCount(editor, blockId)).toBe(0);
		expect(editor.undoManager.undo()).toBe(true);
		expect(atomCount(editor, blockId)).toBe(1);
		expect(editor.getBlock(blockId)?.textContent()).toContain("typed ");
		editor.destroy();
	});
});
