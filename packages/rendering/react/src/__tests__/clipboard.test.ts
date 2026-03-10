// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import type { AssetProvider } from "@pen/core";
import {
	handleClipboardPaste,
	handleCopy,
} from "../field-editor/clipboard";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl";
import type { PasteImporters } from "../context/editorContext";

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

describe("@pen/react clipboard", () => {
	it("preserves inline formatting for internal copy/paste round-trips", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hi there" },
			{
				type: "format-text",
				blockId,
				offset: 0,
				length: 2,
				marks: { bold: true },
			},
		]);

		editor.selectText(blockId, 0, 2);
		handleCopy(editor, { clipboardData } as ClipboardEvent);

		editor.selectText(blockId, 8, 8);
		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);

		expect(editor.getBlock(blockId)?.textDeltas()).toEqual([
			{ insert: "Hi", attributes: { bold: true } },
			{ insert: " there" },
			{ insert: "Hi", attributes: { bold: true } },
		]);

		editor.destroy();
	});

	it("supports unicode round-trips through embedded HTML payloads", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		editor.apply([{ type: "insert-text", blockId, offset: 0, text: "a 文🦄 z" }]);

		editor.selectText(blockId, 2, 5);
		handleCopy(editor, { clipboardData } as ClipboardEvent);

		clipboardData.setData("application/x-pen-blocks", "");
		editor.selectText(blockId, 7, 7);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);

		expect(editor.getBlock(blockId)?.textContent()).toBe("a 文🦄 z文🦄");

		editor.destroy();
	});

	it("does not delete the current selection when image upload fails", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = createFieldEditorStub();
		const clipboardData = createClipboardData([
			new File(["image"], "test.png", { type: "image/png" }),
		]);
		const assetProvider: AssetProvider = {
			upload: vi.fn().mockRejectedValue(new Error("upload failed")),
			resolve(ref) {
				return ref.url;
			},
			async delete() { },
		};

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 0, 5);
		editor.internals.setSlot("paste:assetProvider", assetProvider);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(assetProvider.upload).toHaveBeenCalledTimes(1);
		expect(editor.getBlock(blockId)?.textContent()).toBe("Hello");

		editor.destroy();
	});

	it("pastes uploaded images through the transfer pipeline", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		const fieldEditor = createFieldEditorStub();
		const clipboardData = createClipboardData([
			new File(["image"], "test.png", { type: "image/png" }),
		]);
		const assetProvider: AssetProvider = {
			upload: vi.fn().mockResolvedValue({
				url: "memory://test.png",
				mimeType: "image/png",
			}),
			resolve(ref) {
				return ref.url;
			},
			async delete() { },
		};

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "Hello" },
		]);
		editor.selectText(blockId, 5, 5);
		editor.internals.setSlot("paste:assetProvider", assetProvider);

		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const blockOrder = editor.documentState.blockOrder;
		const insertedImageId = blockOrder[1];
		const insertedImage = insertedImageId
			? editor.getBlock(insertedImageId)
			: null;

		expect(assetProvider.upload).toHaveBeenCalledTimes(1);
		expect(blockOrder).toHaveLength(2);
		expect(insertedImage?.type).toBe("image");
		expect(insertedImage?.props).toMatchObject({
			src: "memory://test.png",
			alt: "test",
		});

		editor.destroy();
	});

	it("replaces an empty block when pasting blocks into it", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		const penBlocks = JSON.stringify([
			{ type: "heading", props: { level: 1 }, content: "Title", deltas: [{ insert: "Title" }] },
		]);
		clipboardData.setData("application/x-pen-blocks", penBlocks);

		editor.selectText(emptyBlockId, 0, 0);
		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);

		const blockOrder = editor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(1);
		const block = editor.getBlock(blockOrder[0])!;
		expect(block.type).toBe("heading");
		expect(block.textContent()).toBe("Title");

		editor.destroy();
	});

	it("does not replace a non-empty block when pasting blocks", () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const blockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();

		editor.apply([
			{ type: "insert-text", blockId, offset: 0, text: "existing" },
		]);

		const penBlocks = JSON.stringify([
			{ type: "heading", props: { level: 1 }, content: "Title", deltas: [{ insert: "Title" }] },
		]);
		clipboardData.setData("application/x-pen-blocks", penBlocks);

		editor.selectText(blockId, 8, 8);
		handleClipboardPaste(
			{ clipboardData } as ClipboardEvent,
			editor,
			fieldEditor,
		);

		const blockOrder = editor.documentState.blockOrder;
		expect(blockOrder).toHaveLength(2);
		expect(editor.getBlock(blockOrder[0])!.textContent()).toBe("existing");
		expect(editor.getBlock(blockOrder[1])!.type).toBe("heading");

		editor.destroy();
	});

	it("replaces an empty block through importer parse output", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
		const emptyBlockId = editor.firstBlock()!.id;
		const clipboardData = createClipboardData();
		const fieldEditor = createFieldEditorStub();
		const importers: PasteImporters = {
			html: {
				parse: vi.fn().mockReturnValue([
					{ type: "heading", props: { level: 2 }, content: "Parsed title" },
				]),
				import: vi.fn(),
				name: "html",
				mimeType: "text/html",
			},
		};

		clipboardData.setData("text/html", "<h2>Parsed title</h2>");
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
		expect(editor.getBlock(blockOrder[0])?.textContent()).toBe("Parsed title");
		expect(importers.html?.import).not.toHaveBeenCalled();
		expect(fieldEditor.activateTextSelection).toHaveBeenCalledWith(
			blockOrder[0],
			12,
			12,
		);

		editor.destroy();
	});

	it("keeps an empty block when importer parse yields no blocks", async () => {
		const editor = createEditor({
			without: ["document-ops", "delta-stream", "undo"],
		});
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
});
