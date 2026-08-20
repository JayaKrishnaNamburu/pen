import { undoExtension } from "@input/pen-undo";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { createEditor as createCoreEditor } from "../index";

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor() {
	return createCoreEditor({
		preset: undoOnlyPreset,
	});
}

type TestYTextLike = {
	insert(offset: number, text: string): void;
};

type TestBlockMapLike = {
	get(key: string): unknown;
};

type TestBlocksMapLike = {
	get(key: string): TestBlockMapLike | undefined;
};

type TestRawDocLike = {
	getMap(name: "blocks"): TestBlocksMapLike;
};

describe("undo restore under remote edits", () => {
	it("maps the stored caret through 100 remote inserts before restore", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "hello world",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectText(blockId, 5, 5);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 5,
					text: "X",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();

		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));
		const remoteYText = adapter
			.raw<TestRawDocLike>(remoteDoc)
			.getMap("blocks")
			.get(blockId)
			?.get("content") as TestYTextLike | undefined;
		if (!remoteYText) {
			throw new Error(`Missing collaborator text for block ${blockId}`);
		}

		const remoteInsertCount = 100;
		for (let index = 0; index < remoteInsertCount; index += 1) {
			const since = Y.encodeStateVector(
				(editorDoc as unknown as { ydoc: Y.Doc }).ydoc,
			);
			adapter.transact(
				remoteDoc,
				() => {
					remoteYText.insert(0, "a");
				},
				"collaborator",
			);
			adapter.applyUpdate(
				editorDoc,
				adapter.encodeUpdate(remoteDoc, since),
			);
		}

		expect(editor.getBlock(blockId)?.textContent()).toBe(
			`${"a".repeat(remoteInsertCount)}helloX world`,
		);

		expect(editor.undoManager.undo()).toBe(true);

		expect(editor.getBlock(blockId)?.textContent()).toBe(
			`${"a".repeat(remoteInsertCount)}hello world`,
		);
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 5 + remoteInsertCount },
			focus: { blockId, offset: 5 + remoteInsertCount },
		});

		editor.destroy();
	});
});
