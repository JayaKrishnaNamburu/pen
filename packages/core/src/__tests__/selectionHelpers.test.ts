import type {
	PenDocument,
	ReadonlySelectionState,
	TextSelection,
} from "@input/pen-types";
import { describe, expect, it } from "vitest";

import {
	getSelectionBlockRange,
	getTrustedSelectionBlockRange,
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
	readonly blockRange: readonly string[];
}): Extract<ReadonlySelectionState, { type: "text" }> {
	return {
		type: "text",
		anchor: input.anchor,
		focus: input.focus,
		blockRange: input.blockRange,
	};
}

describe("selection helpers", () => {
	it("isCollapsed and isMultiBlock read a deep-readonly text selection", () => {
		const collapsed = readonlyText({
			anchor: { blockId: "a", offset: 1 },
			focus: { blockId: "a", offset: 1 },
			blockRange: ["a"],
		});
		const spanned = readonlyText({
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "b", offset: 2 },
			blockRange: ["a", "b"],
		});

		expect(isCollapsed(collapsed)).toBe(true);
		expect(isMultiBlock(collapsed)).toBe(false);
		expect(isCollapsed(spanned)).toBe(false);
		expect(isMultiBlock(spanned)).toBe(true);
		expect(isCollapsed(null)).toBe(false);
		expect(isMultiBlock(null)).toBe(false);
	});

	it("getTrustedSelectionBlockRange returns the stamp and never walks the document", () => {
		const lying = readonlyText({
			anchor: { blockId: "a", offset: 0 },
			focus: { blockId: "c", offset: 1 },
			blockRange: ["a", "b"],
		});
		const doc = {
			get blockOrder() {
				throw new Error("must not walk blockOrder");
			},
		};

		expect(getTrustedSelectionBlockRange(lying)).toEqual(["a", "b"]);
		expect(getTrustedSelectionBlockRange(null)).toEqual([]);
		expect(
			getTrustedSelectionBlockRange({
				type: "block",
				blockIds: ["x", "y"],
			}),
		).toEqual(["x", "y"]);
		expect(
			getTrustedSelectionBlockRange({
				type: "cell",
				blockId: "table",
				anchor: { row: 0, col: 0 },
				head: { row: 0, col: 0 },
			}),
		).toEqual(["table"]);
		expect(getTrustedSelectionBlockRange({ type: "app", appId: "a1" })).toEqual(
			[],
		);
		expect(() =>
			getSelectionBlockRange(doc as unknown as PenDocument, lying),
		).toThrow("must not walk blockOrder");
	});

	it("getSelectionBlockRange still walks the document and ignores a stamped lie", () => {
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
		const lying: TextSelection = {
			type: "text",
			anchor: { blockId: first, offset: 0 },
			focus: { blockId: "b", offset: 0 },
			isCollapsed: true,
			isMultiBlock: false,
			blockRange: [first],
			toRange: () => {
				throw new Error("unused");
			},
		};

		expect(getSelectionBlockRange(editor.internals.doc, lying)).toEqual([
			first,
			"b",
		]);
		expect(getTrustedSelectionBlockRange(lying)).toEqual([first]);
		expect(selectionToRange(editor.internals.doc, lying).blockRange).toEqual([
			first,
			"b",
		]);

		editor.destroy();
	});
});
