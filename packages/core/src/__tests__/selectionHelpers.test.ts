import type {
	PenDocument,
	ReadonlySelectionState,
	TextSelection,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	createTextSelection,
	getSelectionBlockRange,
	isCollapsed,
	isMultiBlock,
	selectionToRange,
} from "../selection/helpers";
import { createEditor as createCoreEditor } from "../index";
import { createDefaultSchema } from "./fixtures/testSchema";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

function createEditor() {
	return createCoreEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
	});
}

function readonlyText(input: {
	readonly anchor: { readonly blockId: string; readonly offset: number };
	readonly focus: { readonly blockId: string; readonly offset: number };
}): Extract<ReadonlySelectionState, { type: "text" }> {
	return {
		type: "text",
		anchor: input.anchor,
		focus: input.focus,
	};
}

describe("selection helpers", () => {
	it("isCollapsed and isMultiBlock read a deep-readonly text selection", () => {
		const collapsed = readonlyText({
			anchor: { blockId: "a", offset: 1 },
			focus: { blockId: "a", offset: 1 },
		});
		const spanned = readonlyText({
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "b", offset: 2 },
		});

		expect(isCollapsed(collapsed)).toBe(true);
		expect(isMultiBlock(collapsed)).toBe(false);
		expect(isCollapsed(spanned)).toBe(false);
		expect(isMultiBlock(spanned)).toBe(true);
		expect(isCollapsed(null)).toBe(false);
		expect(isMultiBlock(null)).toBe(false);
	});

	it("getSelectionBlockRange on a blockOrder list never walks the document", () => {
		const spanned = readonlyText({
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "c", offset: 1 },
		});
		const doc = {
			get blockOrder() {
				throw new Error("must not walk blockOrder");
			},
		};

		expect(getSelectionBlockRange(["a", "b", "c"], spanned)).toEqual([
			"a",
			"b",
			"c",
		]);
		expect(getSelectionBlockRange(["a"], null)).toEqual([]);
		expect(
			getSelectionBlockRange(["x", "y"], {
				type: "block",
				blockIds: ["x", "y"],
			}),
		).toEqual(["x", "y"]);
		expect(
			getSelectionBlockRange(["table"], {
				type: "cell",
				blockId: "table",
				anchor: { row: 0, col: 0 },
				head: { row: 0, col: 0 },
			}),
		).toEqual(["table"]);
		expect(
			getSelectionBlockRange([], { type: "app", appId: "a1" }),
		).toEqual([]);
		expect(() =>
			getSelectionBlockRange(doc as unknown as PenDocument, spanned),
		).toThrow("must not walk blockOrder");
	});

	it("getSelectionBlockRange walks the document from the endpoints", () => {
		const editor = createEditor();
		const first = editor.firstBlock()!.id;
		editor.apply([
			{
				type: "insert-block",
				blockId: "b",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
		]);
		const selection: TextSelection = createTextSelection({
			anchor: { blockId: first, offset: 0 },
			focus: { blockId: "b", offset: 0 },
		});

		expect(getSelectionBlockRange(editor.internals.doc, selection)).toEqual(
			[first, "b"],
		);
		expect(
			selectionToRange(editor.internals.doc, selection).blockRange,
		).toEqual([first, "b"]);

		editor.destroy();
	});
});
