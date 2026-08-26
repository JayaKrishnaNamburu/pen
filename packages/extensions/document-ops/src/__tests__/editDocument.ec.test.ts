import { beforeEach, describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { Editor } from "@input/pen-types";
import { documentOpsExtension, getDocumentToolRuntime } from "../index";

/**
 * EC probes for the `edit_document` channel.
 * Spec: `spec/packages/extensions/ai.md`.
 */

interface EditResult {
	ok: boolean;
	appliedOperations: string[];
	rejected?: Array<{ index: number; operation: string; reason: string }>;
	outline?: Array<{ blockId: string; blockType: string; preview: string }>;
	hint?: string;
}

let editor: Editor;

async function seed(): Promise<{
	headingId: string;
	bodyIds: string[];
	closingId: string;
}> {
	editor = createEditor({
		schema: defaultSchema,
		extensions: [documentOpsExtension()],
	});
	await editor.whenReady();

	const headingId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "set-props",
				blockId: headingId,
				props: { type: "heading", level: 1 },
			},
			{
				type: "splice-text",
				blockId: headingId,
				from: 0,
				to: 0,
				insert: "Quarterly Report",
			},
			{
				type: "insert-block",
				blockId: "intro",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "intro",
				from: 0,
				to: 0,
				insert: "This report covers Q3.",
			},
			{
				type: "insert-block",
				blockId: "closing",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{
				type: "splice-text",
				blockId: "closing",
				from: 0,
				to: 0,
				insert: "Revenue grew. Costs fell. Margins improved.",
			},
		],
		{ origin: "system" },
	);
	return { headingId, bodyIds: ["intro"], closingId: "closing" };
}

async function edit(input: unknown): Promise<EditResult> {
	const runtime = getDocumentToolRuntime(editor)!;
	return (await runtime.executeTool(
		"edit_document",
		input,
		{} as never,
	)) as EditResult;
}

function documentText(): string {
	return Array.from(editor.blocks())
		.map((block) => `${block.type}:${block.textContent()}`)
		.join("|");
}

function marksDescription(from: Editor): string {
	const tool = getDocumentToolRuntime(from)!.getTool("edit_document")!;
	const schema = tool.inputSchema as {
		properties?: {
			operations?: {
				items?: {
					properties?: {
						marks?: { description?: string };
					};
				};
			};
		};
	};
	return (
		schema.properties?.operations?.items?.properties?.marks?.description ??
		""
	);
}

describe("edit_document (EC)", () => {
	beforeEach(async () => {
		await seed();
	});

	it("EC2: a non-identity locator never reaches the handler; an id-addressed edit applies", async () => {
		const before = documentText();
		// The runtime validates against inputSchema before the handler runs, so
		// a text-search locator is refused at the schema boundary rather than
		// being silently ignored by a handler that only reads blockId.
		await expect(
			edit({
				operations: [
					{
						operation: "replace_block_text",
						text: "x",
						search: "Revenue",
					},
				],
			}),
		).rejects.toThrow(/Unknown field.*search/);
		expect(documentText()).toBe(before);

		const byId = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: "closing",
					text: "Rewritten.",
				},
			],
		});
		expect(byId.ok).toBe(true);
		expect(editor.getBlock("closing")?.textContent()).toBe("Rewritten.");
	});

	it("EC3: converts a paragraph to a bullet list from markdown, not block JSON", async () => {
		const result = await edit({
			operations: [
				{
					operation: "replace_blocks",
					blockIds: ["closing"],
					markdown:
						"- Revenue grew\n- Costs fell\n- Margins improved\n",
				},
			],
		});

		expect(result.ok).toBe(true);
		const types = Array.from(editor.blocks()).map((block) => block.type);
		expect(types).toEqual([
			"heading",
			"paragraph",
			"bulletListItem",
			"bulletListItem",
			"bulletListItem",
		]);
	});

	it("EC4: the operation set is closed, enforced by the schema enum", async () => {
		const before = documentText();
		await expect(
			edit({
				operations: [
					{ operation: "rewrite_everything", blockId: "closing" },
				],
			}),
		).rejects.toThrow(/must be one of/);
		expect(documentText()).toBe(before);
	});

	it("EC5: an unknown block id returns the live outline and applies nothing", async () => {
		const before = documentText();
		const result = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: "does-not-exist",
					text: "x",
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.rejected?.[0]?.reason).toMatch(/unknown-block/);
		expect(result.outline?.map((entry) => entry.blockId)).toEqual([
			editor.firstBlock()!.id,
			"intro",
			"closing",
		]);
		expect(documentText()).toBe(before);
	});

	it("EC5: one bad operation among three leaves the good ones applied and names itself", async () => {
		const result = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: "intro",
					text: "Intro rewritten.",
				},
				{
					operation: "replace_block_text",
					blockId: "nope",
					text: "ignored",
				},
				{
					operation: "replace_block_text",
					blockId: "closing",
					text: "Closing rewritten.",
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.appliedOperations).toHaveLength(2);
		expect(result.rejected).toHaveLength(1);
		expect(result.rejected?.[0]?.index).toBe(1);
		expect(editor.getBlock("intro")?.textContent()).toBe(
			"Intro rewritten.",
		);
		expect(editor.getBlock("closing")?.textContent()).toBe(
			"Closing rewritten.",
		);
	});

	it("EC5: a refusal is a returned value, not a thrown exception", async () => {
		await expect(
			edit({
				operations: [
					{ operation: "delete_blocks", blockIds: ["ghost"] },
				],
			}),
		).resolves.toMatchObject({ ok: false });
	});

	it("EC6: an unparseable payload leaves the document byte-identical", async () => {
		const before = documentText();
		const empty = await edit({
			operations: [
				{
					operation: "replace_blocks",
					blockIds: ["closing"],
					markdown: "   ",
				},
			],
		});
		const missing = await edit({
			operations: [{ operation: "insert_blocks", blockId: "closing" }],
		});

		expect(empty.ok).toBe(false);
		expect(missing.ok).toBe(false);
		expect(empty.rejected?.[0]?.reason).toMatch(/missing-markdown/);
		expect(documentText()).toBe(before);
	});

	it("EC6: no operations at all is a refusal, not an empty write", async () => {
		const before = documentText();
		const result = await edit({ operations: [] });
		expect(result.ok).toBe(false);
		expect(result.rejected?.[0]?.reason).toMatch(/no-operations/);
		expect(documentText()).toBe(before);
	});

	it("handles a multi-part edit in one call: retitle, extend, and add a table", async () => {
		const headingId = editor.firstBlock()!.id;
		const result = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: headingId,
					text: "Our Quarter in Review",
				},
				{
					operation: "replace_block_text",
					blockId: "closing",
					text: "Revenue grew. Costs fell. Margins improved. The matrix below breaks this down.",
				},
				{
					operation: "insert_blocks",
					blockId: "closing",
					placement: "after",
					markdown:
						"| Metric | Change |\n| --- | --- |\n| Revenue | +12% |\n",
				},
			],
		});

		expect(result.ok).toBe(true);
		expect(result.appliedOperations).toHaveLength(3);
		expect(editor.getBlock(headingId)?.textContent()).toBe(
			"Our Quarter in Review",
		);
		expect(editor.getBlock("closing")?.textContent()).toContain(
			"The matrix below breaks this down.",
		);
		expect(
			Array.from(editor.blocks()).some((block) => block.type === "table"),
		).toBe(true);
	});

	it("EC18: format_text colors one word; mark props land and id and text stay", async () => {
		const beforeText = editor.getBlock("closing")!.textContent();
		const result = await edit({
			operations: [
				{
					operation: "format_text",
					blockId: "closing",
					matchText: "Revenue",
					marks: { textColor: { color: "red" } },
				},
			],
		});

		expect(result.ok).toBe(true);
		const closing = editor.getBlock("closing");
		expect(closing?.id).toBe("closing");
		expect(closing?.textContent()).toBe(beforeText);
		expect(closing?.textDeltas()).toEqual([
			{ insert: "Revenue", attributes: { textColor: { color: "red" } } },
			{ insert: " grew. Costs fell. Margins improved." },
		]);
	});

	it("EC18: an ambiguous match is refused naming the count and applies nothing", async () => {
		const before = documentText();
		const result = await edit({
			operations: [
				{
					operation: "format_text",
					blockId: "closing",
					matchText: "e",
					marks: { bold: {} },
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.rejected?.[0]?.reason).toMatch(/ambiguous-match/);
		expect(result.rejected?.[0]?.reason).toMatch(/\d+/);
		expect(documentText()).toBe(before);
		expect(editor.getBlock("closing")?.textDeltas()).toEqual([
			{ insert: "Revenue grew. Costs fell. Margins improved." },
		]);
	});

	it("EC18: an unknown mark name is refused and applies nothing", async () => {
		const before = documentText();
		const result = await edit({
			operations: [
				{
					operation: "format_text",
					blockId: "closing",
					matchText: "Revenue",
					marks: { glitter: {} },
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.rejected?.[0]?.reason).toMatch(/unknown-mark/);
		expect(documentText()).toBe(before);
	});

	it("EC18: set_block_props converts a paragraph to a blockquote with the id preserved", async () => {
		const result = await edit({
			operations: [
				{
					operation: "set_block_props",
					blockId: "closing",
					blockType: "blockquote",
				},
			],
		});

		expect(result.ok).toBe(true);
		const closing = editor.getBlock("closing");
		expect(closing?.id).toBe("closing");
		expect(closing?.type).toBe("blockquote");
		expect(closing?.textContent()).toBe(
			"Revenue grew. Costs fell. Margins improved.",
		);
	});

	it("EC18: a props-only heading level change applies without touching text", async () => {
		const headingId = editor.firstBlock()!.id;
		const beforeText = editor.getBlock(headingId)!.textContent();
		const result = await edit({
			operations: [
				{
					operation: "set_block_props",
					blockId: headingId,
					props: { level: 2 },
				},
			],
		});

		expect(result.ok).toBe(true);
		const heading = editor.getBlock(headingId);
		expect(heading?.id).toBe(headingId);
		expect(heading?.type).toBe("heading");
		expect(heading?.props.level).toBe(2);
		expect(heading?.textContent()).toBe(beforeText);
	});

	it("EC18: the marks schema description names live registry marks", async () => {
		const desc = marksDescription(editor);
		expect(desc).toContain("textColor");
		expect(desc).toContain("Colored text");
		expect(desc).toContain("props: color");

		const custom = createEditor({
			schema: defaultSchema.without(["textColor"]).extend([
				{
					type: "glow",
					kind: "mark",
					propSchema: {},
					serialize: {},
					aiDescription: "Glowing text",
				},
			]),
			extensions: [documentOpsExtension()],
		});
		await custom.whenReady();
		const customDesc = marksDescription(custom);
		expect(customDesc).toContain("glow");
		expect(customDesc).toContain("Glowing text");
		expect(customDesc).not.toContain("textColor");
		custom.destroy();
	});

	it("EC6: replace_block_text with a style HTML payload is refused and applies nothing", async () => {
		const headingId = editor.firstBlock()!.id;
		const before = documentText();
		const beforeHeading = editor.getBlock(headingId)!.textContent();
		const result = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: headingId,
					text: '<span style="color:purple">Title</span>',
				},
			],
		});

		expect(result.ok).toBe(false);
		expect(result.appliedOperations).toEqual([]);
		expect(editor.getBlock(headingId)?.textContent()).toBe(beforeHeading);
		expect(documentText()).toBe(before);
	});

	it("EC5: an HTML payload refusal is a returned result naming format_text", async () => {
		await expect(
			edit({
				operations: [
					{
						operation: "replace_block_text",
						blockId: "closing",
						text: '<span style="color:purple">Title</span>',
					},
				],
			}),
		).resolves.toMatchObject({
			ok: false,
			rejected: [
				{
					operation: "replace_block_text",
					reason: expect.stringMatching(
						/html-in-payload.*format_text.*marks/,
					),
				},
			],
		});
		expect(editor.getBlock("closing")?.textContent()).toBe(
			"Revenue grew. Costs fell. Margins improved.",
		);
	});

	it("EC6: a markdown payload with code-span tags or a < b still applies", async () => {
		const replaced = await edit({
			operations: [
				{
					operation: "replace_block_text",
					blockId: "intro",
					text: "Keep a < b in the comparison.",
				},
			],
		});
		expect(replaced.ok).toBe(true);
		expect(editor.getBlock("intro")?.textContent()).toBe(
			"Keep a < b in the comparison.",
		);

		const inserted = await edit({
			operations: [
				{
					operation: "insert_blocks",
					blockId: "closing",
					placement: "after",
					markdown: 'Use `<span style="color:purple">` as a literal.',
				},
			],
		});
		expect(inserted.ok).toBe(true);
		expect(
			Array.from(editor.blocks()).some((block) =>
				block.textContent().includes("<span"),
			),
		).toBe(true);
	});

	it("EC18: format_text and set_block_props address by blockId so EC7 staleness covers them", async () => {
		const format = {
			operation: "format_text",
			blockId: "closing",
			matchText: "Revenue",
			marks: { bold: {} },
		};
		const props = {
			operation: "set_block_props",
			blockId: "intro",
			blockType: "blockquote",
		};
		// refuseStaleEditDocumentCall reads blockId/blockIds/referenceBlockId
		// generically; both new operations carry blockId and nothing else.
		expect(typeof format.blockId).toBe("string");
		expect(typeof props.blockId).toBe("string");
		expect("blockIds" in format).toBe(false);
		expect("referenceBlockId" in props).toBe(false);

		const applied = await edit({ operations: [format, props] });
		expect(applied.ok).toBe(true);
		expect(editor.getBlock("closing")?.id).toBe("closing");
		expect(editor.getBlock("intro")?.type).toBe("blockquote");
	});

	it("move_block needs a distinct reference block", async () => {
		const selfMove = await edit({
			operations: [
				{
					operation: "move_block",
					blockId: "closing",
					referenceBlockId: "closing",
				},
			],
		});
		expect(selfMove.ok).toBe(false);
		expect(selfMove.rejected?.[0]?.reason).toMatch(/invalid-target/);

		const moved = await edit({
			operations: [
				{
					operation: "move_block",
					blockId: "closing",
					referenceBlockId: "intro",
					placement: "before",
				},
			],
		});
		expect(moved.ok).toBe(true);
		expect(Array.from(editor.blocks()).map((block) => block.id)).toEqual([
			editor.firstBlock()!.id,
			"closing",
			"intro",
		]);
	});
});
