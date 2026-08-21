import type { CommitEvent, DiagnosticEvent, Editor } from "@input/pen-types";
import {
	assertDocEquals,
	createDeterministicYDocFixture,
	createTestEditor,
	type TestBlock,
	type TestEditor,
} from "@input/pen-test";
import { afterEach, describe, expect, it } from "vitest";
import { INVALID_TOOL_PAYLOAD_CODE } from "../constants/payloadValidation";
import { ToolContextImpl } from "../toolContext";
import { deleteBlockTool } from "../tools/deleteBlock";
import { insertBlockTool } from "../tools/insertBlock";
import { moveBlockTool } from "../tools/moveBlock";
import { updateBlockTool } from "../tools/updateBlock";
import { writeDocumentTool } from "../tools/writeDocument";

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
 * targets exercise document-ops, not the harness wrapper.
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
		isCollapsed: selection.isCollapsed,
	};
}

async function expectRejectedAndUnchanged(
	editor: TestEditor,
	expected: TestBlock[],
	work: () => unknown,
): Promise<unknown> {
	let error: unknown;
	try {
		await work();
	} catch (caught) {
		error = caught;
	}
	expect(error).toBeInstanceOf(Error);
	assertDocEquals(editor, expected);
	return error;
}

describe("@input/pen-document-ops live document tools", () => {
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

			expect(commits.map((event) => event.origin)).toEqual([{ type: "ai" }]);
		});

		it("leaves the document unchanged when position.after is missing", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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
						source: "document-ops",
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

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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
			expect(diagnostics).toEqual([]);
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

			expect(commits.map((event) => event.origin)).toEqual([{ type: "ai" }]);
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

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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
			expect(diagnostics).toEqual([]);
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

			expect(commits.map((event) => event.origin)).toEqual([{ type: "ai" }]);
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

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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
			expect(diagnostics).toEqual([]);
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

			expect(commits.map((event) => event.origin)).toEqual([{ type: "ai" }]);
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

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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

			expect(commits.map((event) => event.origin)).toEqual([{ type: "ai" }]);
		});

		it("leaves the document unchanged when position.after is missing", async () => {
			const editor = createLiveEditor();
			const diagnostics = listenDiagnostics(editor);

			const error = await expectRejectedAndUnchanged(editor, FIXTURE_BLOCKS, () =>
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
	});

	describe("selection", () => {
		it("does not move an existing text selection when inserting elsewhere", async () => {
			const editor = createLiveEditor();
			editor.selectText("fixture-body", 0, 6);
			const before = selectionPoint(editor);

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
