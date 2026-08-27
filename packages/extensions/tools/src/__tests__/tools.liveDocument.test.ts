import { isCollapsed } from "@input/pen-core";
import type { CommitEvent, DiagnosticEvent, Editor } from "@input/pen-types";
import {
	assertDocEquals,
	createDeterministicYDocFixture,
	createTestEditor,
	type TestBlock,
	type TestEditor,
} from "@input/pen-test";
import { afterEach, describe, expect, it } from "vitest";
import {
	INVALID_TOOL_PAYLOAD_CODE,
	MAX_OP_TEXT_FIELD_LENGTH,
} from "../constants/payloadValidation";
import { ToolContextImpl } from "../toolContext";
import { deleteBlockTool } from "../tools/deleteBlock";
import { getContextTool } from "../tools/getContext";
import { getCursorContextTool } from "../tools/getCursorContext";
import { inspectTargetTool } from "../tools/inspectTarget";
import { insertBlockTool } from "../tools/insertBlock";
import { listBlockTypesTool } from "../tools/listBlockTypes";
import { listValidOperationsTool } from "../tools/listValidOperations";
import { moveBlockTool } from "../tools/moveBlock";
import { readDocumentTool } from "../tools/readDocument";
import { retrieveDocumentSpansTool } from "../tools/retrieveDocumentSpans";
import { searchDocumentTool } from "../tools/searchDocument";
import { updateBlockTool } from "../tools/updateBlock";
import { writeDocumentTool } from "../tools/writeDocument";
import { applyValidatedOps } from "../utils/payloadValidation";

const FIXTURE_BLOCKS: TestBlock[] = [
	{
		id: "fixture-title",
		type: "heading",
		props: { level: 2 },
		content: "Deterministic fixture",
	},
	{
		id: "fixture-body",
		type: "paragraph",
		content: "Stable body text",
	},
];

const editors: TestEditor[] = [];

/**
 * createTestEditor throws on missing ids. Tools must see `null` so invalid
 * targets exercise tools, not the harness wrapper.
 */
function restoreNullableGetBlock(editor: TestEditor): void {
	const lookup = editor.getBlock.bind(editor);
	editor.getBlock = ((blockId: string) => {
		try {
			return lookup(blockId);
		} catch {
			return null;
		}
	}) as TestEditor["getBlock"];
}

function createLiveEditor(blocks: TestBlock[] = FIXTURE_BLOCKS): TestEditor {
	const fixture = createDeterministicYDocFixture({ blocks });
	const editor = createTestEditor({ doc: fixture.ydoc });
	restoreNullableGetBlock(editor);
	editors.push(editor);
	return editor;
}

function listenCommits(editor: Editor): CommitEvent[] {
	const commits: CommitEvent[] = [];
	editor.on("commit", (event) => {
		commits.push(event);
	});
	return commits;
}

function listenDiagnostics(editor: Editor): DiagnosticEvent[] {
	const diagnostics: DiagnosticEvent[] = [];
	editor.on("diagnostic", (event) => {
		diagnostics.push(event);
	});
	return diagnostics;
}

function selectionPoint(editor: Editor) {
	const selection = editor.getSelection();
	if (selection?.type !== "text") {
		return selection;
	}
	return {
		type: selection.type,
		anchor: selection.anchor,
		focus: selection.focus,
		isCollapsed: isCollapsed(selection),
	};
}

function encodeDocument(editor: TestEditor): string {
	return JSON.stringify({
		order: editor.ydoc.getArray("blockOrder").toJSON(),
		blocks: editor.ydoc.getMap("blocks").toJSON(),
		apps: editor.ydoc.getMap("apps").toJSON(),
		metadata: editor.ydoc.getMap("metadata").toJSON(),
	});
}

function expectInvalidPayloadDiagnostic(
	diagnostics: readonly DiagnosticEvent[],
	message: string,
): void {
	expect(diagnostics).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				code: INVALID_TOOL_PAYLOAD_CODE,
				level: "error",
				source: "tools",
				message,
			}),
		]),
	);
}

async function expectRejectedAndUnchanged(
	editor: TestEditor,
	expected: TestBlock[],
	work: () => unknown,
): Promise<unknown> {
	const before = encodeDocument(editor);
	let error: unknown;
	try {
		await work();
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(Error);
	assertDocEquals(editor, expected);
	expect(encodeDocument(editor)).toEqual(before);
	return error;
}

describe("@input/pen-tools live document tools", () => {
	afterEach(async () => {
		const pending = editors.splice(0);
		await Promise.all(pending.map((editor) => editor.destroy()));
	});

	describe("insert_block", () => {
		it("writes the returned block and its text into the live document", async () => {
			const editor = createLiveEditor();
			const result = (await insertBlockTool(editor).handler(
				{
					position: "last",
					blockType: "paragraph",
					content: "Hello from AI",
				},
				{} as never,
			)) as { blockId: string };

			assertDocEquals(editor, [
				...FIXTURE_BLOCKS,
				{
					id: result.blockId,
					type: "paragraph",
					content: "Hello from AI",
				},
			]);
		});

		it("inserts between named neighbors instead of appending", async () => {
			const editor = createLiveEditor();
			const result = (await insertBlockTool(editor).handler(
				{
					position: { after: "fixture-title" },
					blockType: "paragraph",
					content: "Between",
				},
				{} as never,
			)) as { blockId: string };

			assertDocEquals(editor, [
				FIXTURE_BLOCKS[0]!,
				{
					id: result.blockId,
					type: "paragraph",
					content: "Between",
				},
				FIXTURE_BLOCKS[1]!,
			]);
		});

		it("commits insert_block with origin ai", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);

			await insertBlockTool(editor).handler(
				{
					position: "last",
					blockType: "paragraph",
					content: "Origin check",
				},
				{} as never,
			);

			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
			]);
		});

		it("leaves the document unchanged when position.after is missing", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					insertBlockTool(editor).handler(
						{
							position: { after: "missing-block" },
							blockType: "paragraph",
							content: "Should not land",
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: expect.stringContaining("Invalid tool payload"),
				}),
			);
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: INVALID_TOOL_PAYLOAD_CODE,
						source: "tools",
						message: 'Unresolved target: "missing-block"',
					}),
				]),
			);
			expect(diagnostics).toHaveLength(2);
			expect(diagnostics[1]?.message).toMatch(/^Unresolved target: "/);
		});

		it("leaves the document unchanged for an unknown block type", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					insertBlockTool(editor).handler(
						{
							position: "last",
							blockType: "not-a-block",
							content: "Should not land",
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message:
						'Block type "not-a-block" is not available in structured documents.',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Block type "not-a-block" is not available in structured documents.',
			);
		});

		it("leaves the document unchanged for a hidden block type", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					insertBlockTool(editor).handler(
						{
							position: "last",
							blockType: "subdocument",
							content: "Should not land",
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message:
						'Block type "subdocument" is not available in structured documents.',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Block type "subdocument" is not available in structured documents.',
			);
		});

		it("leaves the document byte-identical when insert_block text exceeds MAX_OP_TEXT_FIELD_LENGTH", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);
			const content = "x".repeat(MAX_OP_TEXT_FIELD_LENGTH + 1);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					insertBlockTool(editor).handler(
						{
							position: "last",
							blockType: "paragraph",
							content,
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: expect.stringContaining("Invalid tool payload"),
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				`Op text field exceeds MAX_OP_TEXT_FIELD_LENGTH (${MAX_OP_TEXT_FIELD_LENGTH})`,
			);
		});

		it("persists non-default heading props on the inserted block", async () => {
			const editor = createLiveEditor();
			const result = (await insertBlockTool(editor).handler(
				{
					position: "last",
					blockType: "heading",
					props: { level: 3 },
					content: "Inserted heading",
				},
				{} as never,
			)) as { blockId: string };

			assertDocEquals(editor, [
				...FIXTURE_BLOCKS,
				{
					id: result.blockId,
					type: "heading",
					props: { level: 3 },
					content: "Inserted heading",
				},
			]);
		});
	});

	describe("update_block", () => {
		it("updates heading props without rewriting the existing text", async () => {
			const editor = createLiveEditor();

			const result = (await updateBlockTool(editor).handler(
				{
					blockId: "fixture-title",
					props: { level: 3 },
				},
				{} as never,
			)) as { success: boolean };

			expect(result.success).toBe(true);
			assertDocEquals(editor, [
				{
					id: "fixture-title",
					type: "heading",
					props: { level: 3 },
					content: "Deterministic fixture",
				},
				FIXTURE_BLOCKS[1]!,
			]);
		});

		it("commits update_block with origin ai", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);

			await updateBlockTool(editor).handler(
				{
					blockId: "fixture-title",
					props: { level: 1 },
				},
				{} as never,
			);

			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
			]);
		});

		it("is idempotent when the same props are applied twice", async () => {
			const editor = createLiveEditor();

			await updateBlockTool(editor).handler(
				{
					blockId: "fixture-title",
					props: { level: 3 },
				},
				{} as never,
			);
			await updateBlockTool(editor).handler(
				{
					blockId: "fixture-title",
					props: { level: 3 },
				},
				{} as never,
			);

			assertDocEquals(editor, [
				{
					id: "fixture-title",
					type: "heading",
					props: { level: 3 },
					content: "Deterministic fixture",
				},
				FIXTURE_BLOCKS[1]!,
			]);
		});

		it("leaves the document unchanged when the target block does not exist", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					updateBlockTool(editor).handler(
						{
							blockId: "missing-block",
							props: { level: 3 },
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: 'Unknown block: "missing-block"',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Unknown block: "missing-block"',
			);
		});
	});

	describe("delete_block", () => {
		it("removes only the named block from the live document", async () => {
			const editor = createLiveEditor();

			const result = (await deleteBlockTool(editor).handler(
				{ blockId: "fixture-body" },
				{} as never,
			)) as { success: boolean };

			expect(result.success).toBe(true);
			assertDocEquals(editor, [FIXTURE_BLOCKS[0]!]);
		});

		it("commits delete_block with origin ai", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);

			await deleteBlockTool(editor).handler(
				{ blockId: "fixture-body" },
				{} as never,
			);

			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
			]);
		});

		it("is idempotent after the block is already gone", async () => {
			const editor = createLiveEditor();

			await deleteBlockTool(editor).handler(
				{ blockId: "fixture-body" },
				{} as never,
			);
			await expectRejectedAndUnchanged(editor, [FIXTURE_BLOCKS[0]!], () =>
				deleteBlockTool(editor).handler(
					{ blockId: "fixture-body" },
					{} as never,
				),
			);
		});

		it("leaves the document unchanged when the target block does not exist", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					deleteBlockTool(editor).handler(
						{ blockId: "missing-block" },
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: 'Unknown block: "missing-block"',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Unknown block: "missing-block"',
			);
		});
	});

	describe("move_block", () => {
		it("reorders the named block in the live document", async () => {
			const editor = createLiveEditor();

			const result = (await moveBlockTool(editor).handler(
				{
					blockId: "fixture-body",
					position: "first",
				},
				{} as never,
			)) as { success: boolean };

			expect(result.success).toBe(true);
			assertDocEquals(editor, [FIXTURE_BLOCKS[1]!, FIXTURE_BLOCKS[0]!]);
		});

		it("commits move_block with origin ai", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);

			await moveBlockTool(editor).handler(
				{
					blockId: "fixture-body",
					position: "first",
				},
				{} as never,
			);

			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
			]);
		});

		it("is idempotent when the block is already at the requested position", async () => {
			const editor = createLiveEditor();

			await moveBlockTool(editor).handler(
				{
					blockId: "fixture-body",
					position: "last",
				},
				{} as never,
			);

			assertDocEquals(editor, FIXTURE_BLOCKS);
		});

		it("leaves the document unchanged when position.after is missing", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					moveBlockTool(editor).handler(
						{
							blockId: "fixture-body",
							position: { after: "missing-block" },
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: expect.stringContaining("Invalid tool payload"),
				}),
			);
			expect(diagnostics).toEqual([
				expect.objectContaining({
					code: INVALID_TOOL_PAYLOAD_CODE,
					message: 'Unresolved target: "missing-block"',
				}),
			]);
		});

		it("leaves the document unchanged when the moved block does not exist", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					moveBlockTool(editor).handler(
						{
							blockId: "missing-block",
							position: "first",
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: 'Unknown block: "missing-block"',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Unknown block: "missing-block"',
			);
		});
	});

	describe("write_document", () => {
		it("appends parsed markdown as real blocks after the fixture", async () => {
			const editor = createLiveEditor();

			const result = (await writeDocumentTool(editor).handler(
				{
					format: "markdown",
					content: "## Heading\n\n- Item",
					position: "last",
				},
				{} as never,
			)) as { blockIds: string[] };

			expect(result.blockIds).toHaveLength(2);
			assertDocEquals(editor, [
				...FIXTURE_BLOCKS,
				{
					id: result.blockIds[0],
					type: "heading",
					props: { level: 2 },
					content: "Heading",
				},
				{
					id: result.blockIds[1],
					type: "bulletListItem",
					content: "Item",
				},
			]);
		});

		it("appends a text payload as a real paragraph", async () => {
			const editor = createLiveEditor();

			const result = (await writeDocumentTool(editor).handler(
				{
					format: "text",
					content: "Appended by AI",
					position: "last",
				},
				{} as never,
			)) as { blockIds: string[] };

			expect(result.blockIds).toHaveLength(1);
			assertDocEquals(editor, [
				...FIXTURE_BLOCKS,
				{
					id: result.blockIds[0],
					type: "paragraph",
					content: "Appended by AI",
				},
			]);
		});

		it("inserts explicit blocks with their content", async () => {
			const editor = createLiveEditor();

			const result = (await writeDocumentTool(editor).handler(
				{
					format: "blocks",
					blocks: [
						{
							blockType: "heading",
							props: { level: 3 },
							content: "From blocks",
						},
					],
					position: "last",
				},
				{} as never,
			)) as { blockIds: string[] };

			expect(result.blockIds).toHaveLength(1);
			assertDocEquals(editor, [
				...FIXTURE_BLOCKS,
				{
					id: result.blockIds[0],
					type: "heading",
					props: { level: 3 },
					content: "From blocks",
				},
			]);
		});

		it("commits write_document with origin ai", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);

			await writeDocumentTool(editor).handler(
				{
					format: "text",
					content: "Appended by AI",
					position: "last",
				},
				{} as never,
			);

			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
			]);
		});

		it("leaves the document unchanged when position.after is missing", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					writeDocumentTool(editor).handler(
						{
							format: "text",
							content: "Should not land",
							position: { after: "missing-block" },
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message: expect.stringContaining("Invalid tool payload"),
				}),
			);
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: INVALID_TOOL_PAYLOAD_CODE,
						message: 'Unresolved target: "missing-block"',
					}),
				]),
			);
		});

		it("leaves the document unchanged when content and blocks are both empty", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(
				editor,
				FIXTURE_BLOCKS,
				() =>
					writeDocumentTool(editor).handler(
						{
							format: "text",
							content: "",
						},
						{} as never,
					),
			);

			expect(error).toEqual(
				expect.objectContaining({
					message:
						'write_document expects either a non-empty "content" string or a non-empty "blocks" array.',
				}),
			);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'write_document expects either a non-empty "content" string or a non-empty "blocks" array.',
			);
		});
	});

	describe("applyValidatedOps", () => {
		it("rejects insert-text past the end without applying a sibling insert-block", () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);
			const before = encodeDocument(editor);

			expect(() =>
				applyValidatedOps(
					editor,
					[
						{
							type: "insert-block",
							blockId: "partial-1",
							blockType: "paragraph",
							props: {},
							position: "last",
						},
						{
							type: "splice-text",
							blockId: "fixture-body",
							from: 999,
							to: 999,
							insert: "should not land",
						},
					],
					{ origin: "ai" },
				),
			).toThrow("Invalid tool payload");

			assertDocEquals(editor, FIXTURE_BLOCKS);
			expect(encodeDocument(editor)).toEqual(before);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Offset out of range: 999 is past the end of "fixture-body"',
			);
		});
	});

	describe("ToolContext mutations", () => {
		it("inserts, updates, and deletes through the live document", async () => {
			const editor = createLiveEditor();
			const commits = listenCommits(editor);
			const context = new ToolContextImpl(editor, "doc-1", () => {});

			const blockId = context.insertBlock(
				"heading",
				{ level: 3 },
				{ after: "fixture-title" },
			);
			context.updateBlock(blockId, { level: 4 });
			context.deleteBlock("fixture-body");

			assertDocEquals(editor, [
				FIXTURE_BLOCKS[0]!,
				{
					id: blockId,
					type: "heading",
					props: { level: 4 },
				},
			]);
			expect(commits.map((event) => event.origin)).toEqual([
				{ type: "ai" },
				{ type: "ai" },
				{ type: "ai" },
			]);
		});

		it("leaves the document unchanged when the target block does not exist", () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);
			const parts: unknown[] = [];
			const context = new ToolContextImpl(editor, "doc-1", (part) => {
				parts.push(part);
			});
			const before = encodeDocument(editor);

			expect(() =>
				context.updateBlock("missing-block", { level: 1 }),
			).toThrow('Unknown block: "missing-block"');
			expect(() => context.deleteBlock("missing-block")).toThrow(
				'Unknown block: "missing-block"',
			);
			expect(() =>
				context.insertBlock(
					"paragraph",
					{},
					{ after: "missing-block" },
				),
			).toThrow("Invalid tool payload");

			expect(parts).toEqual([]);
			assertDocEquals(editor, FIXTURE_BLOCKS);
			expect(encodeDocument(editor)).toEqual(before);
			expectInvalidPayloadDiagnostic(
				diagnostics,
				'Unknown block: "missing-block"',
			);
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: INVALID_TOOL_PAYLOAD_CODE,
						message: 'Unresolved target: "missing-block"',
					}),
				]),
			);
		});
	});

	describe("read-only tools", () => {
		const nestedBlocks: TestBlock[] = [
			{
				id: "toggle-1",
				type: "toggle",
				content: "Toggle title",
				children: [
					{
						id: "nested-1",
						type: "paragraph",
						content: "NESTED-SEARCH-HIT",
					},
				],
			},
			...FIXTURE_BLOCKS,
		];

		function readOnlyTools(editor: TestEditor) {
			return [
				readDocumentTool(editor),
				getContextTool(editor),
				getCursorContextTool(editor),
				inspectTargetTool(editor),
				listValidOperationsTool(editor),
				searchDocumentTool(editor),
				retrieveDocumentSpansTool(editor),
				listBlockTypesTool(editor),
			];
		}

		function inputFor(name: string): unknown {
			if (
				name === "search_document" ||
				name === "retrieve_document_spans"
			) {
				return { query: "NESTED-SEARCH-HIT" };
			}
			return {};
		}

		it("does not write when each declared read-only tool is invoked", async () => {
			const editor = createLiveEditor(nestedBlocks);
			const tools = readOnlyTools(editor);
			expect(tools.every((tool) => tool.mutating === false)).toBe(true);
			expect(tools.map((tool) => tool.name).sort()).toEqual(
				[
					"get_context",
					"get_cursor_context",
					"inspect_target",
					"list_block_types",
					"list_valid_operations",
					"read_document",
					"retrieve_document_spans",
					"search_document",
				].sort(),
			);

			const commits = listenCommits(editor);
			const before = encodeDocument(editor);

			for (const tool of tools) {
				await tool.handler(inputFor(tool.name), {} as never);
			}

			expect(encodeDocument(editor)).toEqual(before);
			expect(commits).toEqual([]);
		});

		it("search_document finds text inside nested layout children", async () => {
			const editor = createLiveEditor(nestedBlocks);
			const matches = (await searchDocumentTool(editor).handler(
				{ query: "NESTED-SEARCH-HIT" },
				{} as never,
			)) as Array<{ blockId: string }>;

			expect(matches).toEqual([
				expect.objectContaining({ blockId: "nested-1" }),
			]);
		});

		it("read_document and get_context include nested children, not only top-level order", async () => {
			const editor = createLiveEditor(nestedBlocks);

			const read = (await readDocumentTool(editor).handler(
				{ format: "json" },
				{} as never,
			)) as { blocks: Array<{ id: string }> };
			const context = (await getContextTool(editor).handler(
				{ format: "json" },
				{} as never,
			)) as { blocks: Array<{ id: string }> };

			expect(read.blocks.map((block) => block.id)).toContain("nested-1");
			expect(context.blocks.map((block) => block.id)).toContain(
				"nested-1",
			);
			expect(editor.documentState.blockOrder).not.toContain("nested-1");
		});

		it("retrieve_document_spans ranks a nested child hit", async () => {
			const editor = createLiveEditor(nestedBlocks);
			const result = (await retrieveDocumentSpansTool(editor).handler(
				{ query: "NESTED-SEARCH-HIT" },
				{} as never,
			)) as { spans: Array<{ blockIds: string[] }> };

			expect(
				result.spans.some((span) => span.blockIds.includes("nested-1")),
			).toBe(true);
		});

		it("search_document reaches a grandchild inserted under a nested toggle", async () => {
			const editor = createLiveEditor(nestedBlocks);
			editor.apply(
				[
					{
						type: "insert-block",
						blockId: "inner-toggle",
						blockType: "toggle",
						props: {},
						position: { parent: "toggle-1", index: 1 },
					},
					{
						type: "insert-block",
						blockId: "deep-1",
						blockType: "paragraph",
						props: {},
						position: { parent: "inner-toggle", index: 0 },
					},
					{
						type: "splice-text",
						blockId: "deep-1",
						from: 0,
						to: 0,
						insert: "DEEP-NESTED-HIT",
					},
				],
				{ origin: "user" },
			);

			const matches = (await searchDocumentTool(editor).handler(
				{ query: "DEEP-NESTED-HIT" },
				{} as never,
			)) as Array<{ blockId: string }>;

			expect(matches).toEqual([
				expect.objectContaining({ blockId: "deep-1" }),
			]);
			expect(editor.documentState.blockOrder).not.toContain("deep-1");
		});

		it("search_document finds a child hanging off a callout, not only toggle", async () => {
			const editor = createLiveEditor([
				{
					id: "callout-1",
					type: "callout",
					content: "Callout title",
					children: [
						{
							id: "layout-child-1",
							type: "paragraph",
							content: "LAYOUT-CHILD-HIT",
						},
					],
				},
				...FIXTURE_BLOCKS,
			]);

			const matches = (await searchDocumentTool(editor).handler(
				{ query: "LAYOUT-CHILD-HIT" },
				{} as never,
			)) as Array<{ blockId: string }>;

			expect(matches).toEqual([
				expect.objectContaining({ blockId: "layout-child-1" }),
			]);
			expect(editor.documentState.blockOrder).not.toContain(
				"layout-child-1",
			);
		});
	});

	describe("selection", () => {
		it("does not move an existing text selection when inserting elsewhere", async () => {
			const editor = createLiveEditor();
			editor.selectText("fixture-body", 0, 6);
			const before = selectionPoint(editor);
			expect(before).toMatchObject({ isCollapsed: false });

			await insertBlockTool(editor).handler(
				{
					position: "first",
					blockType: "paragraph",
					content: "Above",
				},
				{} as never,
			);

			expect(selectionPoint(editor)).toEqual(before);
		});
	});
});
