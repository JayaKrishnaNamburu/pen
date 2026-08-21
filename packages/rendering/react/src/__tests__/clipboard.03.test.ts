// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { createEditor as createCoreEditor } from "@input/pen-core";
import { defaultPreset } from "@input/pen-preset-default";
import { handleClipboardPaste } from "@input/pen-dom/field-editor/clipboard";
import type { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import { defaultSchema } from "@input/pen-schema-default";

function createEditor(
	options: Parameters<typeof createCoreEditor>[0] = {},
	config: {
		undo?: boolean;
	} = {},
) {
	return createCoreEditor({
		schema: defaultSchema,...options,
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

describe("@input/pen-react clipboard", () => {
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
