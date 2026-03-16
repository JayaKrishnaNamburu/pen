import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { describe, expect, it } from "vitest";
import { normalizePlaygroundCollaborationDocument } from "./playgroundCollaboration";

type RawBlockOrder = {
	length: number;
	delete(index: number, length: number): void;
};

type RawBlocksMap = {
	clear(): void;
};

type RawDocument = {
	getArray(name: "blockOrder"): RawBlockOrder;
	getMap(name: "blocks"): RawBlocksMap;
};

describe("normalizePlaygroundCollaborationDocument", () => {
	it("collapses empty paragraph-only collaboration docs to one block", () => {
		const editor = createEditor({
			preset: defaultPreset(),
		});
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();
		const thirdBlockId = crypto.randomUUID();

		editor.apply([
			{
				type: "insert-block",
				blockId: secondBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: firstBlockId },
			},
			{
				type: "insert-block",
				blockId: thirdBlockId,
				blockType: "paragraph",
				props: {},
				position: { after: secondBlockId },
			},
		]);

		expect(editor.blockCount()).toBe(3);
		expect(normalizePlaygroundCollaborationDocument(editor)).toBe(true);
		expect(editor.blockCount()).toBe(1);
		expect(editor.firstBlock()?.type).toBe("paragraph");

		editor.destroy();
	});

	it("recovers a paragraph when the collaboration document has no blocks", () => {
		const editor = createEditor({
			preset: defaultPreset(),
		});
		const rawDocument = editor.internals.adapter.raw<RawDocument>(
			editor.internals.crdtDoc,
		);
		const rawBlockOrder = rawDocument.getArray("blockOrder");
		const rawBlocks = rawDocument.getMap("blocks");

		editor.internals.adapter.transact(
			editor.internals.crdtDoc,
			() => {
				rawBlocks.clear();
				rawBlockOrder.delete(0, rawBlockOrder.length);
			},
			"system",
		);

		expect(editor.blockCount()).toBe(0);
		expect(normalizePlaygroundCollaborationDocument(editor)).toBe(true);
		expect(editor.blockCount()).toBe(1);
		expect(editor.firstBlock()?.type).toBe("paragraph");

		editor.destroy();
	});
});
