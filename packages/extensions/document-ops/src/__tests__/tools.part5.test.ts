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
		facet: () => null,
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
	textDeltas: () => Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}>;
	prev?: unknown;
	next?: unknown;
}): {
	id: string;
	type: string;
	props: Record<string, unknown>;
	children: unknown[];
	textContent: (options?: { resolved?: boolean }) => string;
	textDeltas: () => Array<{
		insert: string;
		attributes?: Record<string, unknown>;
	}>;
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
			return capability === "table" && handle.type === "table"
				? handle
				: null;
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
				{
					insert: " draft",
					attributes: { suggestion: { action: "delete" } },
				},
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
		facet: () => null,
		blockCount: () => 3,
		blocks: () => blocks,
		getBlock: (blockId: string) =>
			blocks.find((block) => block.id === blockId) ?? null,
		getSelection: () => ({
			type: "text",
			anchor: { blockId: "block-2", offset: 0 },
			focus: { blockId: "block-2", offset: 6 },
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
				return capability === "table" && this.type === "table"
					? this
					: null;
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
				return capability === "table" && this.type === "table"
					? this
					: null;
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
				return capability === "table" && this.type === "table"
					? this
					: null;
			},
		},
	];

	return {
		documentProfile,
		schema: defaultSchema,
		facet: () => null,
		apply: vi.fn<(ops: DocumentOp[], options?: ApplyOptions) => void>(),
		blocks: () => blocks,
		getBlock: (blockId: string) =>
			blocks.find((block) => block.id === blockId) ?? null,
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
			textDeltas: () => [
				{ insert: "Fast apply preserves stable block identity." },
			],
		}),
	];

	return {
		documentProfile: "structured",
		schema: defaultSchema,
		facet: () => null,
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
		}),
		getSelectedText: () => "Fast",
	} as unknown as Editor;
}

describe("@input/pen-document-ops tools", () => {
	it("rejects invalid tool inputs at the document-ops runtime boundary", async () => {
		const runtime = new ToolRuntimeImpl();
		const searchEditor = createReadDocumentEditor();
		const mutationEditor = createStructuredTargetEditor("paragraph-1");
		runtime.registerTool(searchDocumentTool(searchEditor));
		runtime.registerTool(retrieveDocumentSpansTool(searchEditor));
		runtime.registerTool(moveBlockTool(mutationEditor));
		runtime.registerTool(writeDocumentTool(mutationEditor));

		await expect(
			runtime.executeTool(
				"search_document",
				{
					query: "",
					maxResults: 0,
				},
				{} as never,
			),
		).rejects.toThrow('Invalid input for tool "search_document"');
		await expect(
			runtime.executeTool(
				"retrieve_document_spans",
				{
					query: "",
					maxResults: 99,
				},
				{} as never,
			),
		).rejects.toThrow('Invalid input for tool "retrieve_document_spans"');
		await expect(
			runtime.executeTool(
				"move_block",
				{
					blockId: "paragraph-1",
					position: {
						after: "",
					},
				},
				{} as never,
			),
		).rejects.toThrow('Invalid input for tool "move_block"');
		await expect(
			runtime.executeTool(
				"write_document",
				{
					content: "Hello",
					position: {
						parent: "paragraph-1",
						index: -1,
					},
				},
				{} as never,
			),
		).rejects.toThrow('Invalid input for tool "write_document"');

		expect(mutationEditor.apply).not.toHaveBeenCalled();
	});
});
