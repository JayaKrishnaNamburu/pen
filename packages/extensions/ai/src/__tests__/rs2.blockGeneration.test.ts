import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { undoExtension } from "@input/pen-undo";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { deltaStreamExtension } from "../stream";
import { aiExtension, getAIController } from "../index";
import { createDeferred } from "./extension.testUtils";

/**
 * RS2 for the generate lane. A markdown block generation used to preview by
 * re-staging its whole parsed payload as suggestions on every frame — a
 * second presentation stack with its own lifecycle, and a document write per
 * token. It now previews as streaming preview text and stages once on close
 * (`spec-v5/02-review-surface.md` RS2).
 */
describe("RS2: markdown block generation rides the review surface", () => {
	it("RS2: an in-flight markdown block generation previews without writing, then stages", async () => {
		const releaseFinal = createDeferred();
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					contentFormat: {
						blockGeneration: "markdown",
						selectionRewrite: "text",
					},
					model: {
						async *stream(options) {
							yield {
								type: "replace-preview" as const,
								operation: options.operation!,
								text: "## Title\n\n- one",
							};
							await releaseFinal.promise;
							yield {
								type: "replace-final" as const,
								operation: options.operation!,
								text: "## Title\n\n- one\n- two",
							};
							yield { type: "done" as const };
						},
					},
				}),
			],
		});
		const controller = getAIController(editor)!;
		const session = controller.startSession({
			surface: "bottom-chat",
			target: "document",
		});
		const generationPromise = controller.runSessionPrompt(
			session.id,
			"Write a list",
			{ target: "document" },
		);

		await new Promise((resolve) => setTimeout(resolve, 80));

		// The preview shows the words and stays quiet about structure, which
		// is not final while the call is open.
		expect(
			controller
				.getState()
				.streamingReviewPreviews.map((preview) => preview.text),
		).toEqual(["Title\none"]);
		expect(visibleTexts(editor)).toEqual([]);

		releaseFinal.resolve();
		const generation = await generationPromise;

		expect(generation.status).toBe("complete");
		expect(generation.mutationReceipt?.status).toBe("staged_suggestions");
		expect(generation.suggestionIds?.length ?? 0).toBeGreaterThan(0);
		expect(controller.getState().streamingReviewPreviews).toEqual([]);
		// Structure arrives when the edit stages, as real blocks.
		expect(visibleTexts(editor)).toEqual(["Title", "one", "two"]);
		editor.destroy();
	});
});

function visibleTexts(editor: ReturnType<typeof createEditor>): string[] {
	return editor.documentState.blockOrder
		.map((id) => editor.getBlock(id)?.textContent({ resolved: true }) ?? "")
		.filter((text) => text.trim().length > 0);
}
