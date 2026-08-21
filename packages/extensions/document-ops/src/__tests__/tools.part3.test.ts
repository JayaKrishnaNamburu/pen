import { defaultSchema } from "./fixtures/testSchema";
import type { ApplyOptions, DocumentOp, Editor } from "@input/pen-types";
import { describe, expect, it, vi } from "vitest";
import { ToolContextImpl } from "../toolContext";
import { ToolRuntimeImpl } from "../toolServer";
import { getContextTool } from "../tools/getContext";
import { getCursorContextTool } from "../tools/getCursorContext";
import { inspectTargetTool } from "../tools/inspectTarget";
import { insertBlockTool } from "../tools/insertBlock";
import { listBlockTypesTool } from "../tools/listBlockTypes";
import { listValidOperationsTool } from "../tools/listValidOperations";
import { readDocumentTool } from "../tools/readDocument";
import { searchDocumentTool } from "../tools/searchDocument";
import { retrieveDocumentSpansTool } from "../tools/retrieveDocumentSpans";
import { deleteBlockTool } from "../tools/deleteBlock";
import { moveBlockTool } from "../tools/moveBlock";
import { updateBlockTool } from "../tools/updateBlock";
import { writeDocumentTool } from "../tools/writeDocument";

function createFakeEditor(documentProfile: Editor["documentProfile"]): Editor {
	return {
		documentProfile,
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		internals: {
			emit: vi.fn(),
		},
	} as unknown as Editor;
}

function createMockBlockHandle(input: {
	id: string;
	type: string;
	props?: Record<string, unknown>;
	children?: unknown[];
	textContent: (options?: { resolved?: boolean }) => string;
	textDeltas: () => Array<{ insert: string; attributes?: Record<string, unknown> }>;
	prev?: unknown;
	next?: unknown;
}): {
	id: string;
	type: string;
	props: Record<string, unknown>;
	children: unknown[];
	textContent: (options?: { resolved?: boolean }) => string;
	textDeltas: () => Array<{ insert: string; attributes?: Record<string, unknown> }>;
	tableRowCount: () => number;
	tableColumnCount: () => number;
	tableCell: () => null;
	tableRow: () => null;
	tableColumns: () => never[];
	prev?: unknown;
	next?: unknown;
	as: (capability: string) => unknown;
} {
	const handle = {
		props: {},
		children: [],
		prev: null,
		next: null,
		...input,
		tableRowCount: () => 0,
		tableColumnCount: () => 0,
		tableCell: () => null,
		tableRow: () => null,
		tableColumns: () => [],
		as(capability: string) {
			return capability === "table" && handle.type === "table" ? handle : null;
		},
	};
	return handle;
}

function createReadDocumentEditor(): Editor {
	const blocks = [
		createMockBlockHandle({
			id: "block-1",
			type: "paragraph",
			props: {},
			children: [],
			textContent: (options?: { resolved?: boolean }) =>
				options?.resolved ? "First accepted" : "First accepted",
			textDeltas: () => [{ insert: "First accepted" }],
		}),
		createMockBlockHandle({
			id: "block-2",
			type: "paragraph",
			props: {},
			children: [],
			textContent: (options?: { resolved?: boolean }) =>
				options?.resolved ? "Second" : "Second draft",
			textDeltas: () => [
				{ insert: "Second" },
				{ insert: " draft", attributes: { suggestion: { action: "delete" } } },
			],
		}),
		createMockBlockHandle({
			id: "block-3",
			type: "heading",
			props: {},
			children: [],
			textContent: (options?: { resolved?: boolean }) =>
				options?.resolved ? "Third" : "Third",
			textDeltas: () => [{ insert: "Third" }],
		}),
	] as const;
	for (const block of blocks) {
		delete (block as { prev?: unknown }).prev;
		delete (block as { next?: unknown }).next;
	}

	return {
		documentProfile: "structured",
		schema: defaultSchema,
		blockCount: () => 3,
		blocks: () => blocks,
		getBlock: (blockId: string) => blocks.find((block) => block.id === blockId) ?? null,
		getSelection: () => ({
			type: "text",
			anchor: { blockId: "block-2", offset: 0 },
			focus: { blockId: "block-2", offset: 6 },
			isCollapsed: false,
			toRange: () => ({
				start: { blockId: "block-2", offset: 0 },
				end: { blockId: "block-2", offset: 6 },
				blockRange: ["block-2"],
			}),
		}),
		getSelectedText: () => "Second",
	} as unknown as Editor;
}

function createStructuredTargetEditor(
	activeBlockId: string,
	documentProfile: Editor["documentProfile"] = "structured",
): Editor {
	const blocks = [
		{
			id: "paragraph-1",
			type: "paragraph",
			props: {},
			children: [],
			textContent: () => "Paragraph",
			textDeltas: () => [{ insert: "Paragraph" }],
			tableRowCount: () => 0,
			tableColumnCount: () => 0,
			tableColumns: () => [],
			as(capability: string) {
				return capability === "table" && this.type === "table" ? this : null;
			},
		},
		{
			id: "table-1",
			type: "table",
			props: { hasHeaderRow: true },
			children: [],
			textContent: () => "",
			textDeltas: () => [],
			tableRowCount: () => 3,
			tableColumnCount: () => 2,
			tableColumns: () => [
				{ id: "col-1", title: "Name", type: "text" as const },
				{ id: "col-2", title: "Status", type: "text" as const },
			],
			as(capability: string) {
				return capability === "table" && this.type === "table" ? this : null;
			},
		},
		{
			id: "subdocument-1",
			type: "subdocument",
			props: {},
			children: [],
			textContent: () => "",
			textDeltas: () => [],
			tableRowCount: () => 0,
			tableColumnCount: () => 0,
			tableColumns: () => [],
			as(capability: string) {
				return capability === "table" && this.type === "table" ? this : null;
			},
		},
	];

	return {
		documentProfile,
		schema: defaultSchema,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		blocks: () => blocks,
		getBlock: (blockId: string) => blocks.find((block) => block.id === blockId) ?? null,
		getSelection: () => ({
			type: "block",
			blockIds: [activeBlockId],
		}),
		getSelectedText: () => "",
	} as unknown as Editor;
}

function createNestedDocumentEditor(): Editor {
	const topLevelBlocks = [
		createMockBlockHandle({
			id: "heading-1",
			type: "heading",
			props: { level: 1 },
			children: [],
			textContent: () => "Architecture",
			textDeltas: () => [{ insert: "Architecture" }],
		}),
		createMockBlockHandle({
			id: "layout-1",
			type: "columns",
			props: {},
			children: [],
			textContent: () => "",
			textDeltas: () => [],
		}),
	];
	const nestedBlocks = [
		topLevelBlocks[0],
		topLevelBlocks[1],
		createMockBlockHandle({
			id: "paragraph-1",
			type: "paragraph",
			props: {},
			children: [],
			textContent: () => "Fast apply preserves stable block identity.",
			textDeltas: () => [{ insert: "Fast apply preserves stable block identity." }],
		}),
	];

	return {
		documentProfile: "structured",
		schema: defaultSchema,
		blocks: () => topLevelBlocks,
		documentState: {
			allBlocks: () => nestedBlocks,
		},
		getBlock: (blockId: string) =>
			nestedBlocks.find((block) => block.id === blockId) ?? null,
		getSelection: () => ({
			type: "text",
			anchor: { blockId: "paragraph-1", offset: 0 },
			focus: { blockId: "paragraph-1", offset: 4 },
			isCollapsed: false,
			toRange: () => ({
				start: { blockId: "paragraph-1", offset: 0 },
				end: { blockId: "paragraph-1", offset: 4 },
				blockRange: ["paragraph-1"],
			}),
		}),
		getSelectedText: () => "Fast",
	} as unknown as Editor;
}

describe("@input/pen-document-ops tools", () => {
	it("uses bounded neighbor traversal for cursor context when block links exist", async () => {
		const blocks: Array<{
			id: string;
			type: string;
			props: Record<string, unknown>;
			children: unknown[];
			textContent: () => string;
			textDeltas: () => Array<{ insert: string }>;
			tableRowCount: () => number;
			tableColumnCount: () => number;
			tableCell: () => null;
			tableRow: () => null;
			tableColumns: () => never[];
			prev?: unknown;
			next?: unknown;
		}> = [
				createMockBlockHandle({
					id: "block-1",
					type: "paragraph",
					props: {},
					children: [],
					textContent: () => "First",
					textDeltas: () => [{ insert: "First" }],
					prev: null,
					next: null,
				}),
				createMockBlockHandle({
					id: "block-2",
					type: "paragraph",
					props: {},
					children: [],
					textContent: () => "Second",
					textDeltas: () => [{ insert: "Second" }],
					prev: null,
					next: null,
				}),
				createMockBlockHandle({
					id: "block-3",
					type: "paragraph",
					props: {},
					children: [],
					textContent: () => "Third",
					textDeltas: () => [{ insert: "Third" }],
					prev: null,
					next: null,
				}),
			];
		blocks[0].next = blocks[1];
		blocks[1].prev = blocks[0];
		blocks[1].next = blocks[2];
		blocks[2].prev = blocks[1];

		const editor = {
			documentProfile: "structured",
			schema: defaultSchema,
			getSelection: () => ({
				type: "text",
				anchor: { blockId: "block-2", offset: 0 },
				focus: { blockId: "block-2", offset: 6 },
				isCollapsed: false,
				toRange: () => ({
					start: { blockId: "block-2", offset: 0 },
					end: { blockId: "block-2", offset: 6 },
					blockRange: ["block-2"],
				}),
			}),
			getSelectedText: () => "Second",
			getBlock: (blockId: string) => blocks.find((block) => block.id === blockId) ?? null,
			blocks: vi.fn(() => {
				throw new Error("Cursor context should not scan the full document.");
			}),
		} as unknown as Editor;

		const result = await getCursorContextTool(editor).handler({}, {} as never) as {
			surroundingBlocks: Array<{ id: string }>;
		};

		expect(result.surroundingBlocks.map((block) => block.id)).toEqual([
			"block-1",
			"block-2",
			"block-3",
		]);
	});

	it("inspects table targets with schema-aware details", async () => {
		const editor = createStructuredTargetEditor("table-1");

		const result = await inspectTargetTool(editor).handler({}, {} as never) as {
			target: {
				target: {
					kind: string;
					rowCount: number;
					columnCount: number;
				};
				validOperations: string[];
			} | null;
		};

		expect(result.target?.target).toMatchObject({
			kind: "table",
			rowCount: 3,
			columnCount: 2,
		});
		expect(result.target?.validOperations).toContain("insert_row");
		expect(result.target?.validOperations).toContain("set_cell_text");
	});

	it("returns no valid mutation operations for read-only targets", async () => {
		const editor = createStructuredTargetEditor("subdocument-1");

		const result = await listValidOperationsTool(editor).handler({}, {} as never) as {
			operations: string[];
		};

		expect(result.operations).toEqual([]);
	});

});
