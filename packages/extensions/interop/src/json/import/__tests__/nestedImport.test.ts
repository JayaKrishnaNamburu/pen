import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { createDefaultSchema } from "@input/pen-schema-default";
import { jsonImporter } from "../importer";

const noDefaultExtensionsPreset = {
	resolve() {
		return { extensions: [] };
	},
};

const MARKERS = {
	heading: "HEADING-TOP",
	toggleTitle: "TOGGLE-TITLE",
	toggleChild: "NESTED-TOGGLE-CHILD",
	calloutChild: "NESTED-CALLOUT-CHILD",
	tableCell: "TABLE-CELL-ALICE",
	listFirst: "LIST-ITEM-FIRST",
	listNested: "LIST-ITEM-NESTED",
} as const;

function createBareEditor() {
	const editor = createEditor({
		schema: createDefaultSchema(),
		preset: noDefaultExtensionsPreset,
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

function nestedJsonDocument() {
	return {
		version: 1,
		blocks: [
			{
				type: "heading",
				props: { level: 1 },
				content: { text: MARKERS.heading },
			},
			{
				type: "toggle",
				props: {},
				content: { text: MARKERS.toggleTitle },
				children: [
					{
						type: "paragraph",
						props: {},
						content: { text: MARKERS.toggleChild },
					},
				],
			},
			{
				type: "callout",
				props: { severity: "info" },
				content: { text: "CALLOUT-TITLE" },
				children: [
					{
						type: "paragraph",
						props: {},
						content: { text: MARKERS.calloutChild },
					},
				],
			},
			{
				type: "table",
				props: { hasHeaderRow: true },
				children: [
					{
						type: "__table_row",
						props: {},
						children: [
							{
								type: "__table_cell",
								props: {},
								content: { text: MARKERS.tableCell },
							},
						],
					},
				],
			},
			{
				type: "bulletListItem",
				props: {},
				content: { text: MARKERS.listFirst },
			},
			{
				type: "bulletListItem",
				props: { indent: 1 },
				content: { text: MARKERS.listNested },
			},
		],
	};
}

describe("JSON import nested traversal", () => {
	it("imports nested children, layout children, table cells, and list items into the live document", () => {
		const editor = createBareEditor();
		jsonImporter.import(nestedJsonDocument(), editor);

		const texts = [...editor.documentState.allBlocks()].map((handle) =>
			handle.textContent(),
		);
		for (const marker of [
			MARKERS.heading,
			MARKERS.toggleTitle,
			MARKERS.toggleChild,
			MARKERS.calloutChild,
			MARKERS.listFirst,
			MARKERS.listNested,
		]) {
			expect(texts).toContain(marker);
		}

		const toggle = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "toggle",
		);
		const callout = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "callout",
		);
		expect(
			toggle?.children.some((child) => child.textContent() === MARKERS.toggleChild),
		).toBe(true);
		expect(
			callout?.children.some(
				(child) => child.textContent() === MARKERS.calloutChild,
			),
		).toBe(true);

		const table = [...editor.documentState.allBlocks()].find(
			(handle) => handle.type === "table",
		);
		expect(table?.as("table")?.tableCell(0, 0)?.textContent()).toBe(
			MARKERS.tableCell,
		);

		editor.destroy();
	});
});
