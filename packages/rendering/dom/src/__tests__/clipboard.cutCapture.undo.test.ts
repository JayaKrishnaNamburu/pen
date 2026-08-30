import { describe, expect, it } from "vitest";
import { clipboardFacet, createEditor } from "@input/pen-core";
import type { Editor } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import { getPasteImporters, handleCut } from "../field-editor/clipboard";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createUndoEditor(): Editor {
	return createEditor({
		schema: defaultSchema,
		preset: noDefaultExtensionsPreset,
		extensions: [undoExtension()],
	});
}

function createClipboardData(): DataTransfer {
	const data = new Map<string, string>();
	return {
		files: [] as unknown as FileList,
		types: [],
		getData(type: string) {
			return data.get(type) ?? "";
		},
		setData(type: string, value: string) {
			data.set(type, value);
		},
	} as unknown as DataTransfer;
}

describe("handleCut undo capture boundary", () => {
	it("cut is its own undo step so undo restores the cut, not the preceding phrase", async () => {
		const editor = createUndoEditor();
		await editor.whenReady();
		const blockId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
					to: 0,
					insert: [
						"h",
						{
							nodeType: "mention",
							props: { id: "user-1", label: "Ada" },
						},
						"i",
					],
				},
			],
			{ origin: "user" },
		);

		editor.selectText(blockId, 1, 2);
		handleCut(editor, {
			clipboardData: createClipboardData(),
		} as ClipboardEvent);

		expect(editor.getBlock(blockId)!.inlineDeltas()).toEqual([
			{ insert: "hi" },
		]);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock(blockId)!.inlineDeltas()).toEqual([
			{ insert: "h" },
			{
				insert: {
					type: "mention",
					props: { id: "user-1", label: "Ada" },
				},
			},
			{ insert: "i" },
		]);

		editor.destroy();
	});
});

describe("R8 getPasteImporters consumes the combined clipboard facet", () => {
	it("merges two clipboardFacet providers instead of rejecting the list", () => {
		const html = {
			name: "html",
			mimeType: "text/html",
			import: () => undefined,
		};
		const markdown = {
			name: "markdown",
			mimeType: "text/markdown",
			import: () => undefined,
		};
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
			extensions: [
				{
					name: "html-importers",
					version: "0.0.0",
					facets: [clipboardFacet.of({ html })],
				},
				{
					name: "markdown-importers",
					version: "0.0.0",
					facets: [clipboardFacet.of({ markdown })],
				},
			],
		});

		expect(getPasteImporters(editor)).toEqual({ html, markdown });
		editor.destroy();
	});

	it("returns undefined when the combined table has no importer keys", () => {
		const editor = createEditor({
			schema: defaultSchema,
			preset: noDefaultExtensionsPreset,
		});
		expect(getPasteImporters(editor)).toBeUndefined();
		editor.destroy();
	});
});
