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
import { insertBlockTool } from "../tools/insertBlock";
import { writeDocumentTool } from "../tools/writeDocument";
import { applyValidatedOps } from "../utils/payloadValidation";
import { getDocumentToolRuntime } from "../utils/toolServer";

/**
 * Every in-package path that can execute a document-op.
 *
 * Authorization here is the block-type / payload policy. The AI grant
 * (`allowedMutatingTools`) is owned by `@input/pen-ai-tools` and the
 * transports; this runtime is the trusted-host sink those layers must
 * not call until the grant is open.
 *
 *   Path                         Grant   Block policy   Notes
 *   ---------------------------  ------  -------------  -------------------------
 *   tool.handler                 no      yes            host / test entry
 *   ToolRuntimeImpl.executeTool  no      yes            host sink
 *   getDocumentToolRuntime slot  no      yes            live extension slot
 *   ToolContext.insert/update/   no      yes            programmatic API
 *   applyValidatedOps            no      yes            shared write helper
 *   executeAITool / openAITool   yes     (via grant)    out of this package
 *   SSE / direct transports      yes     (via grant)    out of this package
 *   processStream tool-input-*   yes     empty grant    out of this package
 *   processStream block-insert   yes     type policy    out of this package
 *
 * The block-insert row read "no" until 2026-08-21: structural stream parts
 * wrote without consulting the turn, so a model denied the insert_block tool
 * could emit the equivalent part and write anyway. delta-stream now decides
 * the grant once in applyGuarded, mapping each op to a tool name.
 */

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

describe("document-ops execution path inventory", () => {
	afterEach(async () => {
		const pending = editors.splice(0);
		await Promise.all(pending.map((editor) => editor.destroy()));
	});

	it("host sink: executeTool without an AI grant writes (this is the trusted entry)", async () => {
		const editor = createLiveEditor();
		const runtime = new ToolRuntimeImpl();
		runtime.registerTool(insertBlockTool(editor));

		const result = (await runtime.executeTool(
			"insert_block",
			{
				position: "last",
				blockType: "paragraph",
				content: "host-sink-write",
			},
			{} as never,
		)) as { blockId: string };

		expect(editor.getBlock(result.blockId)?.textContent()).toBe(
			"host-sink-write",
		);
	});

	it("host sink: ToolContext.insertBlock without an AI grant writes", async () => {
		const editor = createLiveEditor();
		const context = new ToolContextImpl(editor, "doc-1", () => {});

		const blockId = context.insertBlock("paragraph", {}, "last");
		editor.apply(
			[
				{
					type: "splice-text",
					blockId,
					from: 0,
				to: 0,
				insert: "context-write",
				},
			],
			{ origin: "ai" },
		);

		expect(editor.getBlock(blockId)?.textContent()).toBe("context-write");
	});

	it("live slot: getDocumentToolRuntime().executeTool is the same un-granted sink", async () => {
		const editor = await createLiveEditorWithRuntime();
		const runtime = getDocumentToolRuntime(editor);
		expect(runtime).not.toBeNull();

		const result = (await runtime!.executeTool(
			"insert_block",
			{
				position: "last",
				blockType: "paragraph",
				content: "slot-sink-write",
			},
			{} as never,
		)) as { blockId: string };

		expect(editor.getBlock(result.blockId)?.textContent()).toBe(
			"slot-sink-write",
		);
	});

	it("well-formed insert_block of a hidden type is denied on every in-package path — document bytes stay identical", async () => {
		const hidden = {
			position: "last" as const,
			blockType: "subdocument",
			content: "Should not land",
		};

		const editor = await createLiveEditorWithRuntime();
		const before = encodeDocument(editor);
		const runtime = getDocumentToolRuntime(editor);
		expect(runtime).not.toBeNull();

		const standalone = new ToolRuntimeImpl();
		standalone.registerTool(insertBlockTool(editor));

		const attempts = [
			() => insertBlockTool(editor).handler(hidden, {} as never),
			() => runtime!.executeTool("insert_block", hidden, {} as never),
			() => standalone.executeTool("insert_block", hidden, {} as never),
			() =>
				new ToolContextImpl(editor, "doc-1", () => {}).insertBlock(
					"subdocument",
					{ title: "No" },
					"last",
				),
			() =>
				applyValidatedOps(
					editor,
					[
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
			() =>
				writeDocumentTool(editor).handler(
					{
						format: "blocks",
						blocks: [
							{ blockType: "paragraph", content: "Allowed sibling" },
							{ blockType: "subdocument", content: "Blocked" },
						],
					},
					{} as never,
				),
		];

		for (const attempt of attempts) {
			try {
				await attempt();
			} catch {
				// denial may throw; the document is the assertion
			}
		}

		assertDocEquals(editor, FIXTURE_BLOCKS);
		expect(encodeDocument(editor)).toEqual(before);
	});
});
