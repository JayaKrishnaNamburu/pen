import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";

/**
 * UC3: the text-parsed plan channel is gone.
 *
 * `extension.editDocumentBlockConversion.test.ts` shows the migrated path — a block conversion
 * staged through `edit_document`. This file carries the other half of the
 * claim: that the door it replaced is shut. A model that puts a document
 * mutation plan in its assistant text gets no mutation from it, on any lane,
 * with any mutation preference (`spec/rules/ai.md` UC3).
 */

const TEXT_EDIT_PLAN = JSON.stringify({
	kind: "text_edit",
	target: { blockId: "PLACEHOLDER", range: { startOffset: 0, endOffset: 5 } },
	operation: "replace",
	text: "Rewritten by a plan",
});

const BLOCK_CONVERT_PLAN = JSON.stringify({
	kind: "block_convert",
	target: { blockId: "PLACEHOLDER" },
	blockType: "heading",
	props: { level: 1 },
});

const REVIEW_BUNDLE_PLAN = JSON.stringify({
	kind: "review_bundle",
	label: "Bundle",
	reason: "Apply together.",
	plans: [
		{
			kind: "block_update",
			target: { blockId: "PLACEHOLDER" },
			props: { level: 3 },
		},
	],
});

describe("UC3: a plan in the text stream is text, not a mutation", () => {
	for (const [label, plan] of [
		["text_edit", TEXT_EDIT_PLAN],
		["block_convert", BLOCK_CONVERT_PLAN],
		["review_bundle", REVIEW_BUNDLE_PLAN],
	] as const) {
		it(`UC3: a streamed ${label} plan mutates nothing`, async () => {
			const { editor, blockId } = createPlanStreamEditor(plan);
			const controller = getAIController(editor)!;

			const generation = await controller.runPrompt("Rewrite this", {
				blockId,
			});

			// The plan arrived, so this is not a vacuous pass: the turn saw the
			// JSON and still refused to compile it into ops.
			expect(generation.text).toContain(plan.slice(0, 24));
			expect(controller.getSuggestions()).toEqual([]);
			expect(editor.getBlock(blockId)!.type).toBe("paragraph");
			expect(editor.getBlock(blockId)!.props.level).toBeUndefined();
			expect(editor.documentState.blockOrder.length).toBe(1);
			editor.destroy();
		});
	}

	it("UC3: a plan cannot reach the document through direct-apply either", async () => {
		// `suggestions` refusing a plan could mean the staging path rejected it
		// rather than the parse being gone. The direct lane has no staging step
		// to hide behind.
		const { editor, blockId } = createPlanStreamEditor(BLOCK_CONVERT_PLAN, {
			mutationPreference: "direct",
		});
		const controller = getAIController(editor)!;

		await controller.runPrompt("Convert this to a heading", { blockId });

		expect(editor.getBlock(blockId)!.type).toBe("paragraph");
		editor.destroy();
	});
});

function createPlanStreamEditor(
	plan: string,
	options?: { mutationPreference?: "suggestions" | "direct" },
) {
	let resolvedBlockId = "";
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				model: {
					async *stream() {
						// Delta-split so a parser watching for a complete JSON
						// document across deltas would still find one.
						const payload = plan.replace(
							/PLACEHOLDER/g,
							resolvedBlockId,
						);
						const half = Math.ceil(payload.length / 2);
						yield {
							type: "text-delta" as const,
							delta: payload.slice(0, half),
						};
						yield {
							type: "text-delta" as const,
							delta: payload.slice(half),
						};
						yield { type: "done" as const };
					},
				},
				mutationPreference:
					options?.mutationPreference ?? "suggestions",
			}),
		],
	});
	resolvedBlockId = editor.firstBlock()!.id;
	editor.apply(
		[
			{
				type: "splice-text",
				blockId: resolvedBlockId,
				from: 0,
				to: 0,
				insert: "Hello",
			},
		],
		{ origin: "system" },
	);
	return { editor, blockId: resolvedBlockId };
}
