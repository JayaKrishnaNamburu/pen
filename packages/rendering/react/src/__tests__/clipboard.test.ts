// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createEditor } from "@pen/core";
import type { AssetProvider } from "@pen/core";
import {
	handleClipboardPaste,
	handleCopy,
} from "../field-editor/clipboard.js";
import type { FieldEditorImpl } from "../field-editor/fieldEditorImpl.js";

function createFileList(files: File[]): FileList {
	return Object.assign([...files], {
		item(index: number) {
			return files[index] ?? null;
		},
	}) as unknown as FileList;
}

function createClipboardData(files: File[] = []): DataTransfer {
	const data = new Map<string, string>();

	return {
		files: createFileList(files),
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
		},
	} as DataTransfer;
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
			async delete() {},
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
});
