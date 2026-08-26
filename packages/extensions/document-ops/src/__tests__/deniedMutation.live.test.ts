import type { Editor } from "@input/pen-types";
import {
	assertDocEquals,
	createDeterministicYDocFixture,
	createTestEditor,
	type TestBlock,
	type TestEditor,
} from "@input/pen-test";
import { afterEach, describe, expect, it } from "vitest";
import { documentOpsExtension } from "../documentOpsExtension";
import { ToolContextImpl } from "../toolContext";
import { ToolRuntimeImpl } from "../toolServer";
import { deleteBlockTool } from "../tools/deleteBlock";
import { insertBlockTool } from "../tools/insertBlock";
import { moveBlockTool } from "../tools/moveBlock";
import { updateBlockTool } from "../tools/updateBlock";
import { writeDocumentTool } from "../tools/writeDocument";
import { applyValidatedOps } from "../utils/payloadValidation";
import { getDocumentToolRuntime } from "../utils/toolServer";

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
	{
		id: "fixture-subdoc",
		type: "subdocument",
		props: { title: "Hidden" },
	},
];

const editors: TestEditor[] = [];

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

async function createLiveEditorWithRuntime(
	blocks: TestBlock[] = FIXTURE_BLOCKS,
): Promise<TestEditor> {
	const editor = createLiveEditor(blocks);
	const extension = documentOpsExtension();
	await extension.activateClient?.({
		editor,
		emit() {},
		getState() {
			return undefined;
		},
	});
	return editor;
}

function encodeDocument(editor: TestEditor): string {
	return JSON.stringify({
		order: editor.ydoc.getArray("blockOrder").toJSON(),
		blocks: editor.ydoc.getMap("blocks").toJSON(),
		apps: editor.ydoc.getMap("apps").toJSON(),
		metadata: editor.ydoc.getMap("metadata").toJSON(),
	});
}

async function expectUnchanged(
	editor: TestEditor,
	work: () => unknown,
): Promise<void> {
	const before = encodeDocument(editor);
	try {
		await work();
	} catch {
		// denial may throw; the document is the assertion
	}
	assertDocEquals(editor, FIXTURE_BLOCKS);
	expect(encodeDocument(editor)).toEqual(before);
}

function mutatingTools(editor: Editor) {
	return [
		insertBlockTool(editor),
		updateBlockTool(editor),
		deleteBlockTool(editor),
		moveBlockTool(editor),
		writeDocumentTool(editor),
	];
}

function deniedInput(name: string): unknown {
	switch (name) {
		case "insert_block":
			return {
				position: "last",
				blockType: "subdocument",
				content: "Should not land",
			};
		case "update_block":
			return {
				blockId: "fixture-subdoc",
				props: { title: "Mutated" },
			};
		case "delete_block":
			return { blockId: "fixture-subdoc" };
		case "move_block":
			return {
				blockId: "fixture-subdoc",
				position: "first",
			};
		case "write_document":
			return {
				format: "blocks",
				blocks: [
					{ blockType: "paragraph", content: "Allowed sibling" },
					{ blockType: "subdocument", content: "Blocked" },
				],
			};
		default:
			throw new Error(`No denied input for tool: ${name}`);
	}
}

describe("denied mutating tools leave the live document unchanged", () => {
	afterEach(async () => {
		const pending = editors.splice(0);
		await Promise.all(pending.map((editor) => editor.destroy()));
	});

	it("handler entry: each mutating tool is denied and the document bytes stay identical", async () => {
		const editor = createLiveEditor();
		const tools = mutatingTools(editor);
		expect(tools.map((tool) => tool.name).sort()).toEqual(
			[
				"delete_block",
				"insert_block",
				"move_block",
				"update_block",
				"write_document",
			].sort(),
		);

		for (const tool of tools) {
			await expectUnchanged(editor, () =>
				tool.handler(deniedInput(tool.name), {} as never),
			);
		}
	});

	it("ToolRuntimeImpl.executeTool entry: denied mutating calls do not write", async () => {
		const editor = createLiveEditor();
		const runtime = new ToolRuntimeImpl();
		for (const tool of mutatingTools(editor)) {
			runtime.registerTool(tool);
		}

		const tools = runtime.listTools();
		expect(tools.map((tool) => tool.name).sort()).toEqual(
			[
				"delete_block",
				"insert_block",
				"move_block",
				"update_block",
				"write_document",
			].sort(),
		);

		for (const tool of tools) {
			await expectUnchanged(editor, () =>
				runtime.executeTool(
					tool.name,
					deniedInput(tool.name),
					{} as never,
				),
			);
		}
	});

	it("extension runtime slot entry: denied mutating calls do not write", async () => {
		const editor = await createLiveEditorWithRuntime();
		const resolved = getDocumentToolRuntime(editor);
		expect(resolved).not.toBeNull();

		for (const name of [
			"insert_block",
			"update_block",
			"delete_block",
			"move_block",
			"write_document",
		] as const) {
			await expectUnchanged(editor, () =>
				resolved!.executeTool(name, deniedInput(name), {} as never),
			);
		}
	});

	it("ToolContext entry: denied insert/update/delete do not write", async () => {
		const editor = createLiveEditor();
		const context = new ToolContextImpl(editor, "doc-1", () => {});

		await expectUnchanged(editor, () =>
			context.insertBlock("subdocument", { title: "No" }, "last"),
		);
		await expectUnchanged(editor, () =>
			context.updateBlock("fixture-subdoc", { title: "No" }),
		);
		await expectUnchanged(editor, () =>
			context.deleteBlock("fixture-subdoc"),
		);
	});

	it("applyValidatedOps entry: hidden insert and hidden mutate do not write", async () => {
		const editor = createLiveEditor();

		await expectUnchanged(editor, () =>
			applyValidatedOps(
				editor,
				[
					{
						type: "insert-block",
						blockId: "sneak-1",
						blockType: "paragraph",
						props: {},
						position: "last",
					},
					{
						type: "insert-block",
						blockId: "sneak-sub",
						blockType: "subdocument",
						props: {},
						position: "last",
					},
				],
				{ origin: "ai" },
			),
		);

		await expectUnchanged(editor, () =>
			applyValidatedOps(
				editor,
				[
					{
						type: "set-props",
						blockId: "fixture-subdoc",
						props: { title: "No" },
					},
				],
				{ origin: "ai" },
			),
		);

		await expectUnchanged(editor, () =>
			applyValidatedOps(
				editor,
				[{ type: "delete-block", blockId: "fixture-subdoc" }],
				{ origin: "ai" },
			),
		);

		await expectUnchanged(editor, () =>
			applyValidatedOps(
				editor,
				[
					{
						type: "move-block",
						blockId: "fixture-subdoc",
						position: "first",
					},
				],
				{ origin: "ai" },
			),
		);
	});

	it("write_document mixed unknown type: schema throw is not the assertion — bytes stay identical", async () => {
		const editor = createLiveEditor();

		await expectUnchanged(editor, () =>
			writeDocumentTool(editor).handler(
				{
					format: "blocks",
					blocks: [
						{ blockType: "paragraph", content: "Allowed sibling" },
						{
							blockType: "not-a-real-type",
							content: "Should not land",
						},
					],
				},
				{} as never,
			),
		);
	});

	it("invalid move_block / write_document schema: executeTool does not write", async () => {
		const editor = createLiveEditor();
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool(moveBlockTool(editor));
		runtime.registerTool(writeDocumentTool(editor));

		await expectUnchanged(editor, () =>
			runtime.executeTool(
				"move_block",
				{
					blockId: "fixture-body",
					position: { after: "" },
				},
				{} as never,
			),
		);
		await expectUnchanged(editor, () =>
			runtime.executeTool(
				"write_document",
				{
					content: "Hello",
					position: {
						parent: "fixture-body",
						index: -1,
					},
				},
				{} as never,
			),
		);
	});

	it("a denied call does not leave editor.apply discarding later writes", async () => {
		const editor = createLiveEditor();
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool(insertBlockTool(editor));

		await expectUnchanged(editor, () =>
			runtime.executeTool(
				"insert_block",
				{
					position: "last",
					blockType: "subdocument",
					content: "Should not land",
				},
				{} as never,
			),
		);

		const beforeIds = [...editor.ydoc.getArray("blockOrder").toJSON()];
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: "fixture-body",
					from: 0,
					to: 0,
					insert: "after-denial",
				},
			],
			{ origin: "user" },
		);
		expect(editor.getBlock("fixture-body")?.textContent()).toContain(
			"after-denial",
		);
		expect(editor.ydoc.getArray("blockOrder").toJSON()).toEqual(beforeIds);
	});
});
