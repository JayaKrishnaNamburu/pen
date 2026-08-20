import { yjsAdapter } from "@input/pen-crdt-yjs";
import { processStream } from "@input/pen-delta-stream";
import { inputRulesExtension } from "@input/pen-input-rules";
import { undoExtension } from "@input/pen-undo";
import {
	type DocumentSession,
	type PenStreamPart,
	getOpOriginType,
} from "@input/pen-types";
import { defineExtension } from "@input/pen-core";
import { describe, expect, it, vi } from "vitest";

import { createDefaultSchema } from "@input/pen-schema-default";
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


describe("@input/pen-core table operations", () => {
	it("convert-block to table preserves inline text in the first cell", () => {
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
				text: "Hello table",
			},
		]);

		editor.apply([
			{
				type: "convert-block",
				blockId: "b1",
				newType: "table",
				newProps: {},
			},
		]);

		const block = editor.getBlock("b1")!;
		expect(block.type).toBe("table");
		expect(block.as("table")!.tableCell(0, 0)?.textContent()).toBe("Hello table");
		expect(block.as("table")!.tableCell(0, 1)?.textContent()).toBe("");
		expect(block.as("table")!.tableCell(1, 0)?.textContent()).toBe("");
		expect(block.as("table")!.tableCell(1, 1)?.textContent()).toBe("");

		editor.destroy();
	});

	it("tableCell returns null for out-of-bounds coordinates", () => {
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

		const block = editor.getBlock("t1")!;
		expect(block.as("table")!.tableCell(-1, 0)).toBeNull();
		expect(block.as("table")!.tableCell(0, -1)).toBeNull();
		expect(block.as("table")!.tableCell(99, 0)).toBeNull();
		expect(block.as("table")!.tableCell(0, 99)).toBeNull();

		editor.destroy();
	});

	it("API5: as(\"table\") is null for non-table blocks", () => {
		const editor = createEditor();

		const block = editor.firstBlock()!;
		expect(block.as("table")).toBeNull();

		editor.destroy();
	});

	it("caches decoration snapshots between decoration updates", () => {
		const editor = createEditor({
			extensions: [
				defineExtension({
					name: "test-decorations",
					decorations(_state, currentEditor) {
						const blockId = currentEditor.firstBlock()?.id;
						if (!blockId) {
							return createDecorationSet([]);
						}

						return createDecorationSet([
							{
								type: "block",
								blockId,
								attributes: { active: true },
							},
						]);
					},
				}),
			],
		});

		const initialDecorations = editor.getDecorations();
		const repeatedDecorations = editor.getDecorations();
		expect(repeatedDecorations).toBe(initialDecorations);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: editor.firstBlock()!.id,
					offset: 0,
					text: "trigger",
				},
			],
			{ origin: "user" },
		);

		const autoRefreshedDecorations = editor.getDecorations();
		expect(autoRefreshedDecorations).not.toBe(initialDecorations);
		expect(editor.getDecorations()).toBe(autoRefreshedDecorations);

		editor.requestDecorationUpdate();

		const refreshedDecorations = editor.getDecorations();
		expect(refreshedDecorations).not.toBe(autoRefreshedDecorations);
		expect(editor.getDecorations()).toBe(refreshedDecorations);

		editor.destroy();
	});
});
