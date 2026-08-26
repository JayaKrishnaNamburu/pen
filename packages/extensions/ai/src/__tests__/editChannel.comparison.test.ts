import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	documentOpsExtension,
	getDocumentToolRuntime,
} from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type { Editor, ModelAdapter } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";

/**
 * The original measurement's decisive criterion, now the only remaining channel.
 *
 * A wrong edit is the document changing into something the prompt did not ask
 * for — strictly worse than no edit. Off-contract assistant text must not
 * become a document write (`spec/packages/extensions/ai.md` EC1, EC6).
 */

const OFF_CONTRACT_OUTPUT =
	"Sure! I've turned the last paragraph into a bullet list for you:\n\n- Revenue grew\n- Costs fell";

function proseModel(): ModelAdapter {
	return {
		async *stream() {
			yield { type: "text-delta" as const, delta: OFF_CONTRACT_OUTPUT };
			yield { type: "done" as const };
		},
	};
}

async function seedEditor(model: ModelAdapter): Promise<{
	editor: Editor;
	headingId: string;
}> {
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			documentOpsExtension(),
			aiExtension({
				model,
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference: "direct",
			}),
		],
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
	return { editor, headingId };
}

function snapshot(editor: Editor): string {
	return Array.from(editor.blocks())
		.map((block) => `${block.type}:${block.textContent()}`)
		.join("|");
}

describe("edit channel comparison: wrong-edits on off-contract output", () => {
	it("EC6: off-contract assistant text changes the document zero times", async () => {
		const { editor } = await seedEditor(proseModel());
		const before = snapshot(editor);

		await getAIController(editor)!.runPrompt(
			"Turn the last paragraph into a bullet list",
			{ target: "document" },
		);

		expect(snapshot(editor)).toBe(before);
		expect(snapshot(editor)).not.toContain("Sure!");

		editor.destroy();
	});

	it("EC6: the tool channel refuses the same off-contract output and changes nothing", async () => {
		const { editor } = await seedEditor(proseModel());
		const before = snapshot(editor);
		const runtime = getDocumentToolRuntime(editor)!;

		// The tool-channel equivalent of the same failure: the model produced
		// something that is not a valid edit. There is no path from that to a
		// document write.
		const result = (await runtime.executeTool(
			"edit_document",
			{
				operations: [
					{
						operation: "replace_blocks",
						blockIds: ["closing"],
						markdown: "   ",
					},
				],
			},
			{} as never,
		)) as { ok: boolean; rejected?: unknown[] };

		expect(result.ok).toBe(false);
		expect(result.rejected).toHaveLength(1);
		expect(snapshot(editor)).toBe(before);

		editor.destroy();
	});

	it("EC5: a refused tool call hands back the ids needed to succeed on retry", async () => {
		const { editor, headingId } = await seedEditor(proseModel());
		const runtime = getDocumentToolRuntime(editor)!;

		const refused = (await runtime.executeTool(
			"edit_document",
			{
				operations: [
					{
						operation: "replace_block_text",
						blockId: "guessed-id",
						text: "x",
					},
				],
			},
			{} as never,
		)) as { ok: boolean; outline?: Array<{ blockId: string }> };

		expect(refused.ok).toBe(false);
		const offered = refused.outline?.map((entry) => entry.blockId) ?? [];
		expect(offered).toContain(headingId);
		expect(offered).toContain("closing");

		// The retry the outline enables succeeds, in the same turn.
		const retried = (await runtime.executeTool(
			"edit_document",
			{
				operations: [
					{
						operation: "replace_blocks",
						blockIds: ["closing"],
						markdown: "- Revenue grew\n- Costs fell\n",
					},
				],
			},
			{} as never,
		)) as { ok: boolean };

		expect(retried.ok).toBe(true);
		expect(
			Array.from(editor.blocks()).filter(
				(block) => block.type === "bulletListItem",
			),
		).toHaveLength(2);

		editor.destroy();
	});
});
