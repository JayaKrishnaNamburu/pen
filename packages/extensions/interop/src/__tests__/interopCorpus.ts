import { createEditor } from "@input/pen-core";
import type { DocumentOp, Editor } from "@input/pen-types";
import { defaultSchema } from "@input/pen-schema-default";

/** Preset that omits bundled extensions — matches interop export/import tests. */
export const interopNoExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

export function createBareInteropEditor(): Editor {
	const editor = createEditor({
		schema: defaultSchema,
		preset: interopNoExtensionsPreset,
	});
	const existingBlockIds = [...editor.documentState.allBlocks()]
		.filter((handle) => handle.parent === null)
		.map((handle) => handle.id);
	if (existingBlockIds.length > 0) {
		editor.apply(
			existingBlockIds.reverse().map((blockId) => ({
				type: "delete-block" as const,
				blockId,
			})),
		);
	}
	return editor;
}

export const NESTED_TRAVERSAL_MARKERS = {
	heading: "HEADING-TOP",
	toggleTitle: "TOGGLE-TITLE",
	toggleChild: "NESTED-TOGGLE-CHILD",
	calloutChild: "NESTED-CALLOUT-CHILD",
	tableCell: "TABLE-CELL-ALICE",
	listFirst: "LIST-ITEM-FIRST",
	listNested: "LIST-ITEM-NESTED",
} as const;

export function nestedTraversalDocumentOps(): DocumentOp[] {
	const MARKERS = NESTED_TRAVERSAL_MARKERS;
	return [
		{
			type: "insert-block",
			blockId: "h1",
			blockType: "heading",
			props: { level: 1 },
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "h1",
			from: 0,
			to: 0,
			insert: MARKERS.heading,
		},
		{
			type: "insert-block",
			blockId: "toggle-1",
			blockType: "toggle",
			props: {},
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "toggle-1",
			from: 0,
			to: 0,
			insert: MARKERS.toggleTitle,
		},
		{
			type: "insert-block",
			blockId: "toggle-child",
			blockType: "paragraph",
			props: {},
			position: { parent: "toggle-1", index: 0 },
		},
		{
			type: "splice-text",
			blockId: "toggle-child",
			from: 0,
			to: 0,
			insert: MARKERS.toggleChild,
		},
		{
			type: "insert-block",
			blockId: "callout-1",
			blockType: "callout",
			props: { severity: "info" },
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "callout-1",
			from: 0,
			to: 0,
			insert: "CALLOUT-TITLE",
		},
		{
			type: "insert-block",
			blockId: "callout-child",
			blockType: "paragraph",
			props: {},
			position: { parent: "callout-1", index: 0 },
		},
		{
			type: "splice-text",
			blockId: "callout-child",
			from: 0,
			to: 0,
			insert: MARKERS.calloutChild,
		},
		{
			type: "insert-block",
			blockId: "t1",
			blockType: "table",
			props: { hasHeaderRow: true },
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "t1",
			cell: { row: 0, col: 0 },
			from: 0,
			to: 0,
			insert: MARKERS.tableCell,
		},
		{
			type: "insert-block",
			blockId: "l1",
			blockType: "bulletListItem",
			props: {},
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "l1",
			from: 0,
			to: 0,
			insert: MARKERS.listFirst,
		},
		{
			type: "insert-block",
			blockId: "l2",
			blockType: "bulletListItem",
			props: { indent: 1 },
			position: "last",
		},
		{
			type: "splice-text",
			blockId: "l2",
			from: 0,
			to: 0,
			insert: MARKERS.listNested,
		},
	];
}

/** EM8 corpus: empty paragraph + table cell, with ZWSP inside real content. */
export const EM8_KEEP = "keep\u200Bme";
export const EM8_CELL_CONTROL = "CELL-OK";

export function seedEm8Document(editor: Editor): void {
	editor.apply([
		{
			type: "insert-block",
			blockId: "empty",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "insert-block",
			blockId: "keep",
			blockType: "paragraph",
			props: {},
			position: "last",
		},
		{
			type: "insert-block",
			blockId: "t1",
			blockType: "table",
			props: { hasHeaderRow: true },
			position: "last",
		},
	]);
	editor.apply([
		{
			type: "splice-text",
			blockId: "keep",
			from: 0,
			to: 0,
			insert: EM8_KEEP,
		},
		{
			type: "splice-text",
			blockId: "t1",
			cell: { row: 0, col: 1 },
			from: 0,
			to: 0,
			insert: EM8_CELL_CONTROL,
		},
	]);
}
