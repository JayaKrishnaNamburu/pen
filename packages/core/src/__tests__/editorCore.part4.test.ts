import { yjsAdapter } from "@pen/crdt-yjs";
import { processStream } from "@pen/delta-stream";
import { inputRulesExtension } from "@pen/input-rules";
import { undoExtension } from "@pen/undo";
import {
	defineExtension,
	type DocumentSession,
	type PenStreamPart,
	getOpOriginType,
} from "@pen/types";
import { describe, expect, it, vi } from "vitest";

import {
	createDecorationSet,
	createDocumentSession,
	createEditor as createCoreEditor,
	createHeadlessEditor,
	ensureInlineCompletionController,
} from "../index";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const undoOnlyPreset = {
	resolve() {
		return { extensions: [undoExtension()] };
	},
};

function createEditor(options: Parameters<typeof createCoreEditor>[0] = {}) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function createDefaultEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor(options);
}

function createEditorWithUndo(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		...options,
		preset: options.preset ?? undoOnlyPreset,
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
}

async function flushMicrotasks(count = 2): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
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

type TestTableRowLike = {
	get(field: "cells"): { delete(index: number, length: number): void };
};

type TestTableContentLike = {
	get(index: number): TestTableRowLike;
};


describe("@pen/core createEditor", () => {
	it("emits unified change and documentCommit once for observed CRDT updates", () => {
		const observed: unknown[][] = [];
		const ext = defineExtension({
			name: "capture-observed-dispatch",
			observe(events) {
				observed.push(events);
			},
		});
		const editor = createEditor({
			extensions: [ext],
		});
		const changes: unknown[][] = [];
		const documentCommits: unknown[] = [];
		const adapter = editor.internals.adapter;
		const editorDoc = editor.internals.crdtDoc;
		const blockId = editor.firstBlock()!.id;
		const remoteDoc = adapter.loadDocument(adapter.encodeState(editorDoc));
		const remoteYDoc = adapter.raw<TestRawDocLike>(remoteDoc);
		const remoteYText = remoteYDoc
			.getMap("blocks")
			.get(blockId)
			?.get("content") as TestYTextLike | undefined;
		if (!remoteYText) {
			throw new Error(`Missing collaborator text for block ${blockId}`);
		}

		editor.on("change", (events) => {
			changes.push(events);
		});
		editor.on("documentCommit", (event) => {
			documentCommits.push(event);
		});
		observed.length = 0;
		changes.length = 0;
		documentCommits.length = 0;

		adapter.transact(
			remoteDoc,
			() => {
				remoteYText.insert(0, "remote ");
			},
			"collaborator",
		);
		adapter.applyUpdate(editorDoc, adapter.encodeState(remoteDoc));

		expect(changes).toHaveLength(1);
		expect(changes[0]).toHaveLength(1);
		expect(changes[0][0]).toMatchObject({
			affectedBlocks: [blockId],
		});
		expect(documentCommits).toHaveLength(1);
		expect(documentCommits[0]).toMatchObject({
			commitId: 2,
			affectedBlocks: [blockId],
		});
		expect(
			(documentCommits[0] as { blockRevisions: Record<string, number> })
				.blockRevisions[blockId],
		).toBe(editor.getBlockRevision(blockId));
		expect(observed).toHaveLength(1);
		expect(observed[0]).toHaveLength(1);

		editor.destroy();
	});

	it("clamps text selections and returns backwards selected text", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: "b1",
				offset: 0,
				text: "hello",
			},
		]);

		editor.selectText("b1", 10, 99);
		expect(editor.getSelection()).toMatchObject({
			type: "text",
			anchor: { blockId: "b1", offset: 5 },
			focus: { blockId: "b1", offset: 5 },
		});

		editor.setSelection({
			type: "text",
			anchor: { blockId: "b1", offset: 5 },
			focus: { blockId: "b1", offset: 2 },
			isCollapsed: false,
			isMultiBlock: false,
			blockRange: ["b1"],
			toRange: () => {
				throw new Error("test helper");
			},
		});

		expect(editor.getSelectedText()).toBe("llo");

		editor.destroy();
	});

	it("selects text ranges across blocks in document order", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b3",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
			{ type: "insert-text", blockId: "b2", offset: 0, text: "World" },
			{ type: "insert-text", blockId: "b3", offset: 0, text: "Again" },
		]);

		editor.selectTextRange(
			{ blockId: "b1", offset: 2 },
			{ blockId: "b3", offset: 3 },
		);

		expect(editor.getSelection()).toMatchObject({
			type: "text",
			anchor: { blockId: "b1", offset: 2 },
			focus: { blockId: "b3", offset: 3 },
			isMultiBlock: true,
			blockRange: ["b1", "b2", "b3"],
		});
		expect(editor.getSelectedText()).toBe("llo\nWorld\nAga");
		expect(editor.getSelectedBlocks().map((block) => block.id)).toEqual([
			"b1",
			"b2",
			"b3",
		]);

		editor.destroy();
	});

	it("deletes multi-block text selections and collapses at the start", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b3",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
			{ type: "insert-text", blockId: "b2", offset: 0, text: "World" },
			{ type: "insert-text", blockId: "b3", offset: 0, text: "Again" },
		]);

		editor.selectTextRange(
			{ blockId: "b1", offset: 2 },
			{ blockId: "b3", offset: 2 },
		);
		editor.deleteSelection();

		expect(editor.getBlock("b1")?.textContent()).toBe("Heain");
		expect(editor.getBlock("b2")).toBeNull();
		expect(editor.getBlock("b3")).toBeNull();
		expect(editor.getSelection()).toMatchObject({
			type: "text",
			anchor: { blockId: "b1", offset: 2 },
			focus: { blockId: "b1", offset: 2 },
			isMultiBlock: false,
			blockRange: ["b1"],
		});

		editor.destroy();
	});

	it("deletes a fully selected structural block", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "d1",
				blockType: "divider",
				props: {},
				position: "last",
			},
		]);

		editor.selectTextRange(
			{ blockId: "d1", offset: 0 },
			{ blockId: "d1", offset: 1 },
		);
		editor.deleteSelection();

		expect(editor.getBlock("d1")).toBeNull();
		expect(editor.getSelection()).toBeNull();

		editor.destroy();
	});

	it("deletes a fully selected delegated block", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "t1",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.selectTextRange(
			{ blockId: "t1", offset: 0 },
			{ blockId: "t1", offset: 1 },
		);
		editor.deleteSelection();

		expect(editor.getBlock("t1")).toBeNull();
		expect(editor.getSelection()).toBeNull();

		editor.destroy();
	});

	it("deletes structural blocks at multi-block selection boundaries", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "p1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "d1",
				blockType: "divider",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "p1", offset: 0, text: "Hello" },
		]);

		editor.selectTextRange(
			{ blockId: "p1", offset: 2 },
			{ blockId: "d1", offset: 1 },
		);
		editor.deleteSelection();

		expect(editor.getBlock("p1")?.textContent()).toBe("He");
		expect(editor.getBlock("d1")).toBeNull();
		expect(editor.getSelection()).toMatchObject({
			type: "text",
			anchor: { blockId: "p1", offset: 2 },
			focus: { blockId: "p1", offset: 2 },
			isMultiBlock: false,
			blockRange: ["p1"],
		});

		editor.destroy();
	});

	it("replaces multi-block text selections at a single insertion point", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b2",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "b3",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "Hello" },
			{ type: "insert-text", blockId: "b2", offset: 0, text: "World" },
			{ type: "insert-text", blockId: "b3", offset: 0, text: "Again" },
		]);

		editor.selectTextRange(
			{ blockId: "b1", offset: 2 },
			{ blockId: "b3", offset: 2 },
		);
		editor.replaceSelection("X");

		expect(editor.getBlock("b1")?.textContent()).toBe("HeXain");
		expect(editor.getBlock("b2")).toBeNull();
		expect(editor.getBlock("b3")).toBeNull();
		expect(editor.getSelection()).toMatchObject({
			type: "text",
			anchor: { blockId: "b1", offset: 3 },
			focus: { blockId: "b1", offset: 3 },
			isMultiBlock: false,
			blockRange: ["b1"],
		});

		editor.destroy();
	});

});
