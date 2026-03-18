import { createEditor } from "@pen/core";
import { defaultPreset } from "@pen/preset-default";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	normalizePlaygroundCollaborationDocument,
	getPlaygroundCollaborationRoom,
	startFreshPlaygroundCollaborationRoom,
} from "./playgroundCollaboration";

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
	afterEach(() => {
		vi.unstubAllGlobals();
	});

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

	it("prefers the room query parameter over the shared default", () => {
		vi.stubGlobal("window", {
			location: new URL("http://127.0.0.1:4173/?room=pen-playground-clean"),
		});

		expect(getPlaygroundCollaborationRoom()).toBe("pen-playground-clean");
	});

	it("navigates to a fresh collaboration room", () => {
		const assign = vi.fn();
		vi.stubGlobal("window", {
			location: {
				href: "http://127.0.0.1:4173/",
				assign,
			},
		});

		const nextRoom = startFreshPlaygroundCollaborationRoom();

		expect(nextRoom.startsWith("pen-playground-")).toBe(true);
		expect(assign).toHaveBeenCalledTimes(1);
		const nextUrl = new URL(assign.mock.calls[0]![0]);
		expect(nextUrl.searchParams.get("room")).toBe(nextRoom);
	});
});
