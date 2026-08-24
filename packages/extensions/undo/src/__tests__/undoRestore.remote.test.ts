import { applySplitBlock, createEditor as createCoreEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { undoExtension } from "../undoExtension";

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
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

describe("@input/pen-undo restore under remote edits", () => {
	it("stack-item snapshot metadata still round-trips unchanged", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "splice-text", blockId, from: 0,
				to: 0,
				insert: "hello" }],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectBlocks([blockId]);
		editor.apply(
			[{ type: "splice-text", blockId, from: 5,
				to: 5,
				insert: "!" }],
			{ origin: "user" },
		);
		await Promise.resolve();
		editor.undoManager.stopCapturing();

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.selection).toMatchObject({
			type: "block",
			blockIds: [blockId],
		});

		editor.destroy();
	});

	it("maps the stored caret through 100 remote inserts before restore", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "hello world",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectText(blockId, 5, 5);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 5,
				to: 5,
				insert: "X",
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

	it("A5: redo of a split restores the caret on the live new block", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const firstBlockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "splice-text",
					blockId: firstBlockId,
					from: 0,
				to: 0,
				insert: "Hello",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectText(firstBlockId, 5, 5);

		const newBlockId = "redo-split-caret";
		applySplitBlock(editor, {
			blockId: firstBlockId,
			offset: 5,
			newBlockId,
			applyOptions: { origin: "user" },
		});
		editor.selectText(newBlockId, 0, 0);
		await Promise.resolve();
		editor.undoManager.stopCapturing();

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(newBlockId)).toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: firstBlockId, offset: 5 },
			focus: { blockId: firstBlockId, offset: 5 },
		});

		expect(editor.undoManager.redo()).toBe(true);
		expect(editor.getBlock(newBlockId)).not.toBeNull();
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId: newBlockId, offset: 0 },
			focus: { blockId: newBlockId, offset: 0 },
		});

		editor.destroy();
	});

	it("restores a collapsed caret after undoing an insert at that caret", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "hello",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectText(blockId, 5, 5);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 5,
				to: 5,
				insert: "X",
				},
			],
			{ origin: "user" },
		);
		await Promise.resolve();
		editor.undoManager.stopCapturing();

		expect(editor.getBlock(blockId)?.textContent()).toBe("helloX");
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)?.textContent()).toBe("hello");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 5 },
			focus: { blockId, offset: 5 },
		});

		editor.destroy();
	});

	it("keeps a collapsed caret collapsed when a remote insert lands on that caret", async () => {
		const editor = createEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "hello world",
				},
			],
			{ origin: "user" },
		);
		editor.undoManager.stopCapturing();
		editor.selectText(blockId, 5, 5);

		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 5,
				to: 5,
				insert: "X",
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

		const since = Y.encodeStateVector(
			(editorDoc as unknown as { ydoc: Y.Doc }).ydoc,
		);
		adapter.transact(
			remoteDoc,
			() => {
				remoteYText.insert(5, "Y");
			},
			"collaborator",
		);
		adapter.applyUpdate(editorDoc, adapter.encodeUpdate(remoteDoc, since));

		expect(editor.getBlock(blockId)?.textContent()).toBe("helloYX world");

		expect(editor.undoManager.undo()).toBe(true);

		expect(editor.getBlock(blockId)?.textContent()).toBe("helloY world");
		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 6 },
			focus: { blockId, offset: 6 },
		});

		editor.destroy();
	});
});
