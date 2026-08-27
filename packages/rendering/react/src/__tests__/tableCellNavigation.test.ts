// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor } from "@input/pen-core";
import { handleTableCellSelectionKeyDown } from "@input/pen-dom";
import { defaultPreset } from "@input/pen";
import type { FieldEditorImpl } from "@input/pen-dom/field-editor/fieldEditorImpl";
import { defaultSchema } from "@input/pen-schema";

class MockClipboardItem {
	readonly types: string[];
	private readonly _data: Record<string, Blob>;

	constructor(data: Record<string, Blob>) {
		this._data = data;
		this.types = Object.keys(data);
	}

	getType(type: string): Promise<Blob> {
		return Promise.resolve(this._data[type]);
	}
}

function createFieldEditorStub(): FieldEditorImpl {
	return {
		isEditing: false,
		deactivate: vi.fn(),
	} as unknown as FieldEditorImpl;
}

function installClipboard(overrides?: {
	write?: (items: MockClipboardItem[]) => Promise<void>;
	writeText?: (text: string) => Promise<void>;
	read?: () => Promise<MockClipboardItem[]>;
	readText?: () => Promise<string>;
}) {
	const clipboard = {
		write: vi.fn(overrides?.write ?? (() => Promise.resolve())),
		writeText: vi.fn(overrides?.writeText ?? (() => Promise.resolve())),
		read: vi.fn(overrides?.read ?? (() => Promise.resolve([]))),
		readText: vi.fn(overrides?.readText ?? (() => Promise.resolve(""))),
	};

	Object.defineProperty(globalThis.navigator, "clipboard", {
		configurable: true,
		value: clipboard,
	});
	vi.stubGlobal("ClipboardItem", MockClipboardItem);

	return clipboard;
}

async function flushAsyncWork(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

function createTableEditor() {
	const editor = createEditor({
		schema: defaultSchema,
		preset: defaultPreset({
			tools: false,
			deltaStream: false,
			undo: false,
		}),
	});

	editor.apply([
		{
			type: "insert-block",
			blockId: "t1",
			blockType: "table",
			props: {},
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "t1",
			cell: { row: 0, col: 0 },
			from: 0,
			to: 0,
			insert: "Bob's",
		},
		{
			type: "splice-text",
			blockId: "t1",
			cell: { row: 0, col: 1 },
			from: 0,
			to: 0,
			insert: "Target",
		},
	]);

	return editor;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("@input/pen-react table cell navigation clipboard", () => {
	it("does not cut cells when clipboard writes fail", async () => {
		const editor = createTableEditor();
		const fieldEditor = createFieldEditorStub();
		const root = document.createElement("div");
		installClipboard({
			write: () => Promise.reject(new Error("denied")),
			writeText: () => Promise.reject(new Error("denied")),
		});

		editor.selectCell("t1", 0, 0);
		const event = new KeyboardEvent("keydown", {
			key: "x",
			metaKey: true,
		});

		expect(
			handleTableCellSelectionKeyDown({
				event,
				editor,
				fieldEditor,
				root,
			}),
		).toBe(true);
		await flushAsyncWork();

		expect(
			editor.getBlock("t1")!.as("table")?.tableCell(0, 0)?.textContent(),
		).toBe("Bob's");

		editor.destroy();
	});

	it("round-trips structured cell payloads with apostrophes", async () => {
		const editor = createTableEditor();
		const fieldEditor = createFieldEditorStub();
		const root = document.createElement("div");
		let capturedItem: MockClipboardItem | null = null;
		const clipboard = installClipboard({
			write: (items) => {
				capturedItem = items[0] ?? null;
				return Promise.resolve();
			},
			read: () => Promise.resolve(capturedItem ? [capturedItem] : []),
		});

		editor.selectCell("t1", 0, 0);
		handleTableCellSelectionKeyDown({
			event: new KeyboardEvent("keydown", {
				key: "c",
				metaKey: true,
			}),
			editor,
			fieldEditor,
			root,
		});
		await flushAsyncWork();

		expect(capturedItem).not.toBeNull();
		expect(clipboard.write).toHaveBeenCalledTimes(1);

		const htmlBlob = await capturedItem!.getType("text/html");
		const html = await htmlBlob.text();
		expect(html).toContain('data-pen-cells="');
		expect(html).not.toContain("data-pen-cells='");

		editor.selectCell("t1", 0, 1);
		handleTableCellSelectionKeyDown({
			event: new KeyboardEvent("keydown", {
				key: "v",
				metaKey: true,
			}),
			editor,
			fieldEditor,
			root,
		});
		await flushAsyncWork();

		expect(
			editor.getBlock("t1")!.as("table")?.tableCell(0, 1)?.textContent(),
		).toBe("Bob's");

		editor.destroy();
	});
});
