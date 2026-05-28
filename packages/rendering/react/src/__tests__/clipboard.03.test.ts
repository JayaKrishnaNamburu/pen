// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createEditor as createCoreEditor } from "@pen/core";
import type { AssetProvider } from "@pen/types";
import { defaultPreset } from "@pen/preset-default";
import {
	handleClipboardPaste,
	handleCopy,
} from "../field-editor/clipboard";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import type { PasteImporters } from "../context/editorContext";

function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
	config: {
		undo?: boolean;
	} = {},
) {
	return createCoreEditor({
		...options,
		preset: defaultPreset({
			documentOps: false,
			deltaStream: false,
			undo: config.undo ?? false,
		}),
	});
}

function createFileList(files: File[]): FileList {
	return Object.assign([...files], {
		item(index: number) {
			return files[index] ?? null;
		},
	}) as unknown as FileList;
}

function createClipboardData(files: File[] = []): DataTransfer {
	const data = new Map<string, string>();
	const types: string[] = files.length > 0 ? ["Files"] : [];

	return {
		files: createFileList(files),
		types,
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
		},
	} as unknown as DataTransfer;
}

function createFieldEditorStub(): FieldEditorImpl {
	return {
		activateTextSelection: vi.fn(),
	} as unknown as FieldEditorImpl;
}

function getClipboardPenBlocks(
	clipboardData: DataTransfer,
): Array<{ type?: string; content?: string }> {
	return JSON.parse(
		clipboardData.getData("application/x-pen-blocks"),
	) as Array<{ type?: string; content?: string }>;
}

function seedTable(
	editor: ReturnType<typeof createEditor>,
	tableId: string,
): void {
	editor.apply([
		{
			type: "insert-block",
			blockId: tableId,
			blockType: "table",
			props: {},
			position: "last",
		},
		{
			type: "insert-table-cell-text",
			blockId: tableId,
			row: 0,
			col: 0,
			offset: 0,
			text: "Alpha",
		},
		{
			type: "insert-table-cell-text",
			blockId: tableId,
			row: 0,
			col: 1,
			offset: 0,
			text: "Bravo",
		},
	]);
}

function seedDatabase(
	editor: ReturnType<typeof createEditor>,
	blockId: string,
): void {
	editor.apply([
		{
			type: "insert-block",
			blockId,
			blockType: "database",
			props: {},
			position: "last",
		},
	]);
}

describe("@pen/react clipboard", () => {
	it("round-trips a structured database block selection as a database block payload", () => {
		const sourceEditor = createEditor();
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		seedDatabase(sourceEditor, "database-structured");
		sourceEditor.selectBlock("database-structured");
		handleCopy(sourceEditor, { clipboardData } as ClipboardEvent);

		expect(getClipboardPenBlocks(clipboardData).map((block) => block.type)).toEqual([
			"database",
		]);

		const targetEditor = createEditor();
		const emptyBlockId = targetEditor.firstBlock()!.id;
		targetEditor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			targetEditor,
			fieldEditor,
		);

		const blockOrder = targetEditor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(1);
		expect(targetEditor.getBlock(blockOrder[0])?.type).toBe("database");

		sourceEditor.destroy();
		targetEditor.destroy();
	});

	it("round-trips a flow-promoted database selection as document blocks", () => {
		const seedEditor = createEditor();
		const firstBlockId = seedEditor.firstBlock()!.id;
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		seedEditor.apply([
			{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
		]);
		seedDatabase(seedEditor, "database-flow");
		seedEditor.apply([
			{
				type: "insert-block",
				blockId: paragraphId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "After",
			},
		]);

		const document = seedEditor.internals.crdtDoc;
		seedEditor.internals.adapter.setDocumentProfile?.(document, "flow");

		const sourceEditor = createEditor({
			document,
		});
		seedEditor.destroy();

		sourceEditor.selectTextRange(
			{ blockId: firstBlockId, offset: 0 },
			{ blockId: paragraphId, offset: 5 },
		);
		handleCopy(sourceEditor, { clipboardData } as ClipboardEvent);

		expect(getClipboardPenBlocks(clipboardData).map((block) => block.type)).toEqual([
			"paragraph",
			"database",
			"paragraph",
		]);

		const targetEditor = createEditor();
		const emptyBlockId = targetEditor.firstBlock()!.id;
		targetEditor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			targetEditor,
			fieldEditor,
		);

		const blockOrder = targetEditor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(3);
		expect(targetEditor.getBlock(blockOrder[0])?.textContent()).toBe("Intro");
		expect(targetEditor.getBlock(blockOrder[1])?.type).toBe("database");
		expect(targetEditor.getBlock(blockOrder[2])?.textContent()).toBe("After");

		sourceEditor.destroy();
		targetEditor.destroy();
	});

	it("avoids direct database block paste in flow documents", () => {
		const sourceEditor = createEditor({
			documentProfile: "flow",
		});
		const firstBlockId = sourceEditor.firstBlock()!.id;
		const paragraphId = crypto.randomUUID();
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		sourceEditor.apply([
			{ type: "insert-text", blockId: firstBlockId, offset: 0, text: "Intro" },
		]);
		seedDatabase(sourceEditor, "database-flow-paste");
		sourceEditor.apply([
			{
				type: "insert-block",
				blockId: paragraphId,
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "insert-text",
				blockId: paragraphId,
				offset: 0,
				text: "After",
			},
		]);

		sourceEditor.selectTextRange(
			{ blockId: firstBlockId, offset: 0 },
			{ blockId: paragraphId, offset: 5 },
		);
		handleCopy(sourceEditor, { clipboardData } as ClipboardEvent);

		const targetEditor = createEditor({
			documentProfile: "flow",
		});
		const emptyBlockId = targetEditor.firstBlock()!.id;
		targetEditor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			targetEditor,
			fieldEditor,
		);

		const blockOrder = targetEditor.documentState.blockOrder;
		expect(
			blockOrder.some((blockId) => targetEditor.getBlock(blockId)?.type === "database"),
		).toBe(false);

		sourceEditor.destroy();
		targetEditor.destroy();
	});

	it("does not direct-paste unknown pen block payloads in flow documents", () => {
		const targetEditor = createEditor({
			documentProfile: "flow",
		});
		const emptyBlockId = targetEditor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		targetEditor.apply([
			{ type: "insert-text", blockId: emptyBlockId, offset: 0, text: "Hello" },
		]);
		targetEditor.selectText(emptyBlockId, 0, 5);
		clipboardData.setData(
			"application/x-pen-blocks",
			JSON.stringify([
				{ type: "customWidget", props: {}, content: "Ignored" },
			]),
		);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			targetEditor,
			fieldEditor,
		);

		expect(targetEditor.documentState.blockOrder).toHaveLength(1);
		expect(targetEditor.getBlock(emptyBlockId)?.textContent()).toBe("Hello");

		targetEditor.destroy();
	});

});
