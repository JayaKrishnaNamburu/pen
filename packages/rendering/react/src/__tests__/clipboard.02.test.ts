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
	it("keeps HTML paragraph parsing when inline marks are preserved", async () => {
		const editor = createEditor();
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([
					{
						type: "paragraph",
						props: {},
						content: "First paragraph.\n\nSecond paragraph.",
						marks: [{ type: "bold", start: 0, end: 5 }],
					},
				]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
			markdown: {
				parse: vi.fn().mockReturnValue([
					{ type: "paragraph", props: {}, content: "First paragraph." },
					{ type: "paragraph", props: {}, content: "Second paragraph." },
				]),
				import: vi.fn(),
				name: "markdown",
				mimeType: "text/plain",
			},
		};

		clipboardData.setData("text/html", "<span><strong>First</strong> paragraph.<br><br>Second paragraph.</span>");
		clipboardData.setData("text/plain", "First paragraph.\n\nSecond paragraph.");
		editor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
			importers,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const block = editor.getBlock(editor.documentState.blockOrder[0]!)!;
		expect(block.textDeltas()).toEqual([
			{ insert: "First", attributes: { bold: true } },
			{ insert: " paragraph.\n\nSecond paragraph." },
		]);
		expect(importers.markdown?.parse).not.toHaveBeenCalled();
		expect(importers.html?.import).not.toHaveBeenCalled();

		editor.destroy();
	});

	it("keeps an empty block when importer parse yields no blocks", async () => {
		const editor = createEditor();
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
		};

		clipboardData.setData("text/html", "<script>alert('xss')</script>");
		editor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
			importers,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(editor.documentState.blockOrder).toEqual([emptyBlockId]);
		expect(editor.getBlock(emptyBlockId)?.type).toBe("paragraph");
		expect(importers.html?.import).toHaveBeenCalledTimes(1);

		editor.destroy();
	});

	it("filters flow-disallowed importer parse blocks before applying parsed paste", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([
					{
						type: "database",
						props: {},
						database: {
							columns: [],
							rows: [],
						},
					},
					{ type: "heading", props: { level: 2 }, content: "Allowed title" },
				]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
		};

		clipboardData.setData("text/html", "<div>mixed</div>");
		editor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
			importers,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const blockOrder = editor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(1);
		expect(blockOrder[0]).not.toBe(emptyBlockId);
		expect(editor.getBlock(blockOrder[0])?.type).toBe("heading");
		expect(
			blockOrder.some((blockId) => editor.getBlock(blockId)?.type === "database"),
		).toBe(false);
		expect(importers.html?.import).not.toHaveBeenCalled();
		expect(fieldEditor.activateTextSelection).toHaveBeenCalledWith(
			blockOrder[0],
			13,
			13,
		);

		editor.destroy();
	});

	it("preserves the current selection when parsed paste normalizes to zero blocks", async () => {
		const editor = createEditor({
			documentProfile: "flow",
		});
		const blockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([
					{
						type: "database",
						props: {},
						database: {
							columns: [],
							rows: [],
						},
					},
				]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
		};

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Keep me",
			},
		]);
		editor.selectText(blockId, 0, 7);
		clipboardData.setData("text/html", "<div>db only</div>");

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
			importers,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(editor.documentState.blockOrder).toEqual([blockId]);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Keep me");
		expect(importers.html?.import).not.toHaveBeenCalled();

		editor.destroy();
	});

	it("filters unknown importer parse blocks before applying parsed paste", async () => {
		const editor = createEditor();
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([
					{ type: "customWidget", props: {}, content: "Ignored" },
					{ type: "heading", props: { level: 2 }, content: "Allowed title" },
				]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
		};

		clipboardData.setData("text/html", "<div>mixed</div>");
		editor.selectText(emptyBlockId, 0, 0);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
			importers,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const blockOrder = editor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(1);
		expect(blockOrder[0]).not.toBe(emptyBlockId);
		expect(editor.getBlock(blockOrder[0])?.type).toBe("heading");
		expect(importers.html?.import).not.toHaveBeenCalled();
		expect(fieldEditor.activateTextSelection).toHaveBeenCalledWith(
			blockOrder[0],
			13,
			13,
		);

		editor.destroy();
	});

	it("round-trips a structured table block selection as a table block payload", () => {
		const sourceEditor = createEditor();
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		seedTable(sourceEditor, "table-structured");
		sourceEditor.selectBlock("table-structured");
		handleCopy(sourceEditor, { clipboardData } as ClipboardEvent);

		expect(getClipboardPenBlocks(clipboardData).map((block) => block.type)).toEqual([
			"table",
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
		expect(targetEditor.getBlock(blockOrder[0])?.type).toBe("table");
		expect(targetEditor.getBlock(blockOrder[0])?.tableCell(0, 0)?.textContent()).toBe(
			"Alpha",
		);
		expect(targetEditor.getBlock(blockOrder[0])?.tableCell(0, 1)?.textContent()).toBe(
			"Bravo",
		);

		sourceEditor.destroy();
		targetEditor.destroy();
	});

	it("round-trips a flow-promoted table selection as document blocks", () => {
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
		seedTable(sourceEditor, "table-flow");
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

		expect(getClipboardPenBlocks(clipboardData).map((block) => block.type)).toEqual([
			"paragraph",
			"table",
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
		expect(targetEditor.getBlock(blockOrder[1])?.type).toBe("table");
		expect(targetEditor.getBlock(blockOrder[1])?.tableCell(0, 0)?.textContent()).toBe(
			"Alpha",
		);
		expect(targetEditor.getBlock(blockOrder[2])?.textContent()).toBe("After");

		sourceEditor.destroy();
		targetEditor.destroy();
	});


});
