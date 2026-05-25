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
	it("processes streamed AI deltas through the default delta-stream pipeline", async () => {
		const editor = createDefaultEditor();
		const blockId = editor.firstBlock()!.id;

		await processStream(
			createStream([
				{ type: "gen-start", zoneId: "zone-1", blockId },
				{ type: "gen-delta", zoneId: "zone-1", delta: "Hello " },
				{ type: "gen-delta", zoneId: "zone-1", delta: "world" },
				{ type: "gen-end", zoneId: "zone-1", status: "complete" },
			]),
			editor,
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"Hello world",
		);
		expect(
			editor.internals.getSlot<{ generationZone: unknown }>(
				"delta-stream:target",
			)?.generationZone ?? null,
		).toBeNull();

		editor.destroy();
	});

	it("keeps streamed AI generations in their own undo group", async () => {
		const editor = createDefaultEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: secondBlockId,
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "system" },
		);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: firstBlockId,
					offset: 0,
					text: "hello",
				},
			],
			{ origin: "user" },
		);

		await processStream(
			createStream([
				{ type: "gen-start", zoneId: "zone-2", blockId: secondBlockId },
				{ type: "gen-delta", zoneId: "zone-2", delta: "AI output" },
				{ type: "gen-end", zoneId: "zone-2", status: "complete" },
			]),
			editor,
		);

		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"hello",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"hello",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		editor.destroy();
	});

	it("keeps concurrent user edits outside the generation zone in a separate undo group", async () => {
		const editor = createDefaultEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: secondBlockId,
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "system" },
		);

		await processStream(
			(async function* (): AsyncIterable<PenStreamPart> {
				yield {
					type: "gen-start",
					zoneId: "zone-concurrent",
					blockId: secondBlockId,
				};

				editor.apply(
					[
						{
							type: "insert-text",
							blockId: firstBlockId,
							offset: 0,
							text: "user edit",
						},
					],
					{ origin: "user" },
				);

				yield {
					type: "gen-delta",
					zoneId: "zone-concurrent",
					delta: "AI output",
				};
				yield {
					type: "gen-end",
					zoneId: "zone-concurrent",
					status: "complete",
				};
			})(),
			editor,
		);

		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"user edit",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"user edit",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		editor.destroy();
	});

	it("keeps user edits inside the generation zone in the same undo group", async () => {
		const editor = createDefaultEditor();
		const blockId = editor.firstBlock()!.id;

		await processStream(
			(async function* (): AsyncIterable<PenStreamPart> {
				yield { type: "gen-start", zoneId: "zone-shared", blockId };
				yield {
					type: "gen-delta",
					zoneId: "zone-shared",
					delta: "AI ",
				};

				editor.apply(
					[
						{
							type: "insert-text",
							blockId,
							offset: 3,
							text: "user ",
						},
					],
					{ origin: "user" },
				);

				yield {
					type: "gen-delta",
					zoneId: "zone-shared",
					delta: "output",
				};
				yield {
					type: "gen-end",
					zoneId: "zone-shared",
					status: "complete",
				};
			})(),
			editor,
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"user AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"user AI output",
		);

		editor.destroy();
	});

	it("tracks imported edits in the undo stack", () => {
		const editor = createEditorWithUndo();
		const blockId = editor.firstBlock()!.id;

		editor.apply(
			[
				{
					type: "insert-text",
					blockId,
					offset: 0,
					text: "Imported text",
				},
			],
			{ origin: "import", undoGroup: true },
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"Imported text",
		);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		editor.destroy();
	});

	it("emits history origin for undo transactions on documentCommit", () => {
		const editor = createEditorWithUndo();
		const blockId = editor.firstBlock()!.id;
		const commitOrigins: string[] = [];

		editor.on("documentCommit", (event) => {
			commitOrigins.push(getOpOriginType(event.origin));
		});

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hello",
			},
		]);

		editor.undoManager.undo();

		expect(commitOrigins).toContain("user");
		expect(commitOrigins).toContain("history");

		editor.destroy();
	});
});
