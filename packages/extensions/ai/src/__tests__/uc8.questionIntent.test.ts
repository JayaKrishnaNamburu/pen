import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import type { Editor, ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";
import { calledEditTool } from "../controller/unappliedEdit";

/**
 * UC8: a question is answered from reads. It must not open a review
 * session, stage a suggestion surface, or force a mutating tool — while
 * the same fixture under an edit prompt produces a staged edit, so the
 * pass cannot come from the channel being broken.
 */

const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) (\S+) -->/g;

function documentFingerprint(editor: Editor): string {
	return [...editor.blocks()]
		.map((block) => `${block.id}:${block.type}:${block.textContent()}`)
		.join("\n");
}

function answeringModel(): ModelAdapter {
	return {
		async *stream() {
			yield {
				type: "text-delta",
				delta: "It reports that revenue grew.",
			} as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
}

function editingModel(): ModelAdapter {
	let passes = 0;
	return {
		async *stream(request) {
			passes += 1;
			if (passes > 1) {
				yield { type: "done" } as ModelStreamEvent;
				return;
			}
			const serialized = JSON.stringify(request.messages);
			const lastParagraph = [
				...serialized.matchAll(BLOCK_ANNOTATION_PATTERN),
			]
				.map((match) => ({ id: match[1]!, type: match[2]! }))
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			yield {
				type: "tool-call",
				toolCallId: "call-1",
				toolName: "edit_document",
				input: {
					operations: [
						{
							operation: "replace_block_text",
							blockId: lastParagraph!.id,
							text: "Rewritten.",
						},
					],
				},
			} as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
}

function fixtureEditor(model: ModelAdapter) {
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				model,
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference: "suggestions",
				allowedMutatingTools: ["edit_document"],
			}),
		],
	});
	editor.apply(
		[
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
				insert: "Revenue grew. Costs fell.",
			},
		],
		{ origin: "user" },
	);
	return { editor, controller: getAIController(editor)! };
}

describe("UC8: a question never touches mutation plumbing", () => {
	it("UC8: a question stages nothing, opens no review session, and leaves the document unchanged", async () => {
		const { editor, controller } = fixtureEditor(answeringModel());
		try {
			const before = documentFingerprint(editor);
			const generation = await controller.runPrompt(
				"What does the closing paragraph say?",
				{ target: "document" },
			);

			expect(generation.status).toBe("complete");
			expect(calledEditTool(generation.steps)).toBe(false);
			expect(controller.getSuggestions()).toHaveLength(0);
			expect(
				controller
					.getActiveSession()
					?.turns.some(
						(turn) => (turn.suggestionIds?.length ?? 0) > 0,
					) ?? false,
			).toBe(false);
			expect(documentFingerprint(editor)).toBe(before);
		} finally {
			editor.destroy();
		}
	});

	it("UC8: the same fixture under an edit prompt stages an edit", async () => {
		const { editor, controller } = fixtureEditor(editingModel());
		try {
			const before = documentFingerprint(editor);
			const generation = await controller.runPrompt(
				"Rewrite the closing paragraph.",
				{ target: "document" },
			);

			expect(calledEditTool(generation.steps)).toBe(true);
			expect(controller.getSuggestions().length).toBeGreaterThan(0);
			// Staged text lives in the document under a suggestion mark — that
			// is the review surface, not a durable write. So the control is
			// that this fingerprint moves where the question's did not; an
			// unchanged fingerprint here would mean nothing was staged.
			expect(documentFingerprint(editor)).not.toBe(before);
			expect(documentFingerprint(editor)).toContain("Rewritten.");
		} finally {
			editor.destroy();
		}
	});
});
