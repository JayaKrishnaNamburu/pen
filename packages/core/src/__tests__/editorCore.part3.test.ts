import { yjsAdapter } from "@input/pen-crdt-yjs";
import { undoExtension } from "@input/pen-undo";
import {
	type DocumentSession,
	type PenStreamPart,
} from "@input/pen-types";
import { defineExtension, getOpOriginType } from "@input/pen-core";
import { describe, expect, it, vi } from "vitest";

import { createDefaultSchema } from "./fixtures/testSchema";
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
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? noDefaultExtensionsPreset,
	});
}

function createDefaultEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
	});
}

function createEditorWithUndo(
	options: Parameters<typeof createCoreEditor>[0] = {},
) {
	return createCoreEditor({
		schema: createDefaultSchema(),
		...options,
		preset: options.preset ?? undoOnlyPreset,
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
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


describe("@input/pen-core createEditor", () => {
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

	it("clears stale grid state when converting table blocks", () => {
		const editor = createEditor();

		editor.apply([
			{
				type: "insert-block",
				blockId: "table-block",
				blockType: "table",
				props: {},
				position: "last",
			},
		]);

		editor.apply([
			{
				type: "convert-block",
				blockId: "table-block",
				newType: "paragraph",
			},
		]);

		const tableBlock = editor.getBlock("table-block")!;
		expect(tableBlock.type).toBe("paragraph");
		expect(tableBlock.as("table")).toBeNull();

		const tableBlockMap = editor.internals.doc.blocks.get(
			"table-block",
		) as TestBlockMapLike;
		expect(tableBlockMap.get("tableContent")).toBeUndefined();
		expect(tableBlockMap.get("tableColumns")).toBeUndefined();

		editor.destroy();
	});

	it("queues reentrant apply calls from observe hooks", () => {
		let appended = false;
		const ext = defineExtension({
			name: "append-exclamation",
			observe(events, editor) {
				if (appended) return;
				const hasUserEdit = events.some(
					(event) =>
						event.origin.type === "user" && !event.summary.isEmpty,
				);
				if (!hasUserEdit) return;

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

	it("emits unified change and documentCommit once for a local apply batch", () => {
		const observed: unknown[][] = [];
		const ext = defineExtension({
			name: "capture-local-dispatch",
			observe(events) {
				observed.push([...events]);
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
