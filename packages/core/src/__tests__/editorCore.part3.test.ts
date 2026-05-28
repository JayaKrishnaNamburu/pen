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
	it("splits at offset zero by inserting an empty block above", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello world",
			},
		]);

		editor.apply([
			{
				type: "split-block",
				blockId,
				offset: 0,
				newBlockId: "b2",
			},
		]);

		expect(editor.documentState.blockOrder).toEqual([blockId, "b2"]);
		expect(editor.getBlock(blockId)?.textContent()).toBe("");
		expect(editor.getBlock("b2")?.textContent()).toBe("hello world");

		editor.destroy();
	});

	it("preserves full text offsets for code blocks", () => {
		const editor = createEditor();
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{ type: "convert-block", blockId, newType: "codeBlock" },
			{ type: "insert-text", blockId, offset: 0, text: "abcd" },
		]);

		editor.selectTextRange({ blockId, offset: 1 }, { blockId, offset: 3 });

		expect(editor.selection).toMatchObject({
			type: "text",
			anchor: { blockId, offset: 1 },
			focus: { blockId, offset: 3 },
		});
		expect(editor.getSelectedText()).toBe("bc");

		editor.destroy();
	});

	it("clears stale grid state when converting table or database blocks", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "table-block",
				blockType: "table",
				props: {},
				position: "last",
			},
			{
				type: "insert-block",
				blockId: "database-block",
				blockType: "database",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "database-insert-row",
				blockId: "database-block",
				rowId: "row-1",
				values: {
					name: "Alpha",
					tags: "todo",
					status: "true",
				},
			},
			{
				type: "convert-block",
				blockId: "table-block",
				newType: "paragraph",
			},
			{
				type: "convert-block",
				blockId: "database-block",
				newType: "paragraph",
			},
		]);

		const tableBlock = editor.getBlock("table-block")!;
		const databaseBlock = editor.getBlock("database-block")!;
		expect(tableBlock.type).toBe("paragraph");
		expect(tableBlock.tableRowCount()).toBe(0);
		expect(tableBlock.tableColumns()).toEqual([]);
		expect(tableBlock.databaseViews()).toEqual([]);

		expect(databaseBlock.type).toBe("paragraph");
		expect(databaseBlock.tableRowCount()).toBe(0);
		expect(databaseBlock.tableColumns()).toEqual([]);
		expect(databaseBlock.databaseViews()).toEqual([]);
		expect(databaseBlock.databasePrimaryViewId()).toBeNull();

		const tableBlockMap = editor.internals.doc.blocks.get(
			"table-block",
		) as TestBlockMapLike;
		const databaseBlockMap = editor.internals.doc.blocks.get(
			"database-block",
		) as TestBlockMapLike;
		expect(tableBlockMap.get("tableContent")).toBeUndefined();
		expect(tableBlockMap.get("tableColumns")).toBeUndefined();
		expect(tableBlockMap.get("databaseViews")).toBeUndefined();
		expect(tableBlockMap.get("databasePrimaryViewId")).toBeUndefined();
		expect(databaseBlockMap.get("tableContent")).toBeUndefined();
		expect(databaseBlockMap.get("tableColumns")).toBeUndefined();
		expect(databaseBlockMap.get("databaseViews")).toBeUndefined();
		expect(databaseBlockMap.get("databasePrimaryViewId")).toBeUndefined();

		editor.destroy();
	});

	it("queues reentrant apply calls from observe hooks", () => {
		let appended = false;
		const ext = defineExtension({
			name: "append-exclamation",
			observe(events, editor) {
				if (appended) return;
				const hasInsertText = events.some((event) =>
					event.ops.some((op) => op.type === "insert-text"),
				);
				if (!hasInsertText) return;

				appended = true;
				editor.apply(
					[
						{
							type: "insert-text",
							blockId: "b1",
							offset: 5,
							text: "!",
						},
					],
					{ origin: "extension" },
				);
			},
		});

		const editor = createEditor({
			extensions: [ext],
		});

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

		expect(editor.getBlock("b1")?.textContent()).toBe("hello!");

		editor.destroy();
	});

	it("activates input-rules extensions and applies block conversions", async () => {
		const editor = createEditor({
			extensions: [inputRulesExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.selectTextRange({ blockId, offset: 0 }, { blockId, offset: 0 });

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "#",
				},
			],
			{ origin: "user" },
		);
		editor.selectTextRange({ blockId, offset: 1 }, { blockId, offset: 1 });
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 1,
					text: " ",
				},
			],
			{ origin: "user" },
		);
		await flushMicrotasks();

		expect(editor.getBlock(blockId)?.type).toBe("heading");
		expect(editor.getBlock(blockId)?.props.level).toBe(1);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		editor.destroy();
	});

	it("activates input-rules extensions and applies inline markdown conversions", async () => {
		const editor = createEditor({
			extensions: [inputRulesExtension()],
		});
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "**hello*",
				},
			],
			{ origin: "user" },
		);
		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 8,
					text: "*",
				},
			],
			{ origin: "user" },
		);
		await flushMicrotasks();

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"hello",
		);
		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{
				insert: "hello",
				attributes: { bold: true },
			},
		]);

		editor.destroy();
	});

	it("emits unified change and documentCommit once for a local apply batch", () => {
		const observed: unknown[][] = [];
		const ext = defineExtension({
			name: "capture-local-dispatch",
			observe(events) {
				observed.push(events);
			},
		});
		const editor = createEditor({
			extensions: [ext],
		});
		const changes: unknown[][] = [];
		const documentCommits: unknown[] = [];
		const blockId = editor.firstBlock()!.id;

		editor.on("change", (events) => {
			changes.push(events);
		});
		editor.on("documentCommit", (event) => {
			documentCommits.push(event);
		});
		observed.length = 0;
		changes.length = 0;
		documentCommits.length = 0;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		expect(changes).toHaveLength(1);
		expect(changes[0]).toHaveLength(1);
		expect(changes[0][0]).toMatchObject({
			origin: "user",
			affectedBlocks: [blockId],
		});
		expect(documentCommits).toHaveLength(1);
		expect(documentCommits[0]).toMatchObject({
			commitId: 2,
			origin: "user",
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

});
