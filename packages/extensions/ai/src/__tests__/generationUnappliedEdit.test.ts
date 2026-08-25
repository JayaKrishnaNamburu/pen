import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type { Diagnostic, ModelAdapter } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";

/**
 * A fast-apply turn that leaves the document untouched must say so.
 *
 * The strategy carries its edit inside the assistant text, so a plan that does
 * not compile produces no ops and throws nothing. Before this was reported as a
 * failure, such a turn was indistinguishable from a successful one: the host saw
 * `status: "complete"` and a pile of generated characters, and the user saw
 * nothing happen with no reason given (`spec-better-ai/00-concept.md`, Defect 4).
 */

const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) \S+ -->/g;

/**
 * Answers with `buildText`, given the block ids the working set annotated —
 * the same way a real model learns which blocks it may address.
 */
function textModel(buildText: (blockIds: string[]) => string): ModelAdapter {
	return {
		async *stream(request) {
			const serialized = JSON.stringify(request.messages);
			const blockIds = [
				...serialized.matchAll(BLOCK_ANNOTATION_PATTERN),
			].map((match) => match[1]!);
			yield { type: "text-delta" as const, delta: buildText(blockIds) };
			yield { type: "done" as const };
		},
	};
}

function createChatEditor(model: ModelAdapter) {
	return createEditor({
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
}

function seedDocument(editor: ReturnType<typeof createEditor>): void {
	editor.apply(
		[
			{
				type: "splice-text",
				blockId: editor.firstBlock()!.id,
				from: 0,
				to: 0,
				insert: "Revenue grew. Costs fell. Margins improved.",
			},
		],
		{ origin: "system" },
	);
}

describe("a fast-apply turn that applies nothing", () => {
	it("reports an error instead of a completed turn", async () => {
		// Opens the contract, so the plain-markdown fallback is refused, but
		// names no edit the executor can compile.
		const editor = createChatEditor(
			textModel(() => "<pen-fast-apply><edit></edit></pen-fast-apply>"),
		);
		await editor.whenReady();
		seedDocument(editor);
		const before = Array.from(editor.blocks()).map((block) =>
			block.textContent(),
		);

		const diagnostics: Diagnostic[] = [];
		editor.on("diagnostic", (event) => diagnostics.push(event));

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Improve the text and make the last bit a bullet.",
			{ target: "document" },
		);

		expect(generation.applyStrategy).toBe("markdown-fast-apply");
		expect(generation.status).toBe("error");
		expect(generation.turnReason).toMatch(/no edit could be applied/i);
		expect(
			diagnostics.some(
				(event) => event.code === "GENERATION_EDIT_NOT_APPLIED",
			),
		).toBe(true);
		// The reported failure and the document agree.
		expect(
			Array.from(editor.blocks()).map((block) => block.textContent()),
		).toEqual(before);

		editor.destroy();
	});

	it("still reports success when the same strategy does apply an edit", async () => {
		const editor = createChatEditor(
			textModel((blockIds) =>
				[
					"<pen-fast-apply>",
					"<instructions>Shorten the paragraph.</instructions>",
					"<edit>",
					"<operation>replace_text</operation>",
					`<blockId>${blockIds[0]}</blockId>`,
					"<text>Revenue grew.</text>",
					"</edit>",
					"</pen-fast-apply>",
				].join("\n"),
			),
		);
		await editor.whenReady();
		seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Improve the text and make the last bit a bullet.",
			{ target: "document" },
		);

		expect(generation.status).toBe("complete");
		expect(editor.firstBlock()?.textContent()).toBe("Revenue grew.");

		editor.destroy();
	});
});
