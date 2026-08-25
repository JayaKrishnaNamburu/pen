import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";

/**
 * End-to-end agent-chat edits, wired like the playground: markdown block
 * generation, direct mutation preference, document-scope prompts. The model
 * double reads the annotated working set from the request like a real model
 * would and answers with the fast-apply contract. These tests cover the whole
 * chain — router intent, document-scope working set, fast-apply prompt,
 * plan parsing, execution, and direct apply — so a contract mismatch between
 * any two layers fails loudly here.
 */

const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) (\S+) -->/g;

function annotationsFromRequest(request: {
	messages: unknown;
}): Array<{ id: string; type: string }> {
	const serialized = JSON.stringify(request.messages);
	return [...serialized.matchAll(BLOCK_ANNOTATION_PATTERN)].map((match) => ({
		id: match[1]!,
		type: match[2]!,
	}));
}

function fastApplyModel(
	buildXml: (annotations: Array<{ id: string; type: string }>) => string,
): ModelAdapter {
	return {
		async *stream(request) {
			const annotations = annotationsFromRequest(
				request as { messages: unknown },
			);
			yield {
				type: "text-delta" as const,
				delta: buildXml(annotations),
			};
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

function seedDocument(editor: ReturnType<typeof createEditor>): {
	headingId: string;
	lastParagraphId: string;
} {
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
				insert: "This report covers the third quarter.",
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
	return { headingId, lastParagraphId: "closing" };
}

describe("agent chat document edits", () => {
	it("turns the last paragraph into a bullet list via document-scope fast-apply", async () => {
		const model = fastApplyModel((annotations) => {
			const lastParagraph = annotations
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			expect(lastParagraph).toBeTruthy();
			return [
				"<pen-fast-apply>",
				"<instructions>I am converting the last paragraph into a bullet list.</instructions>",
				"<scope>single-block</scope>",
				"<edit>",
				"<operation>replace_blocks</operation>",
				`<block>${lastParagraph!.id}</block>`,
				"<markdown><![CDATA[- Revenue grew",
				"- Costs fell",
				"- Margins improved",
				"]]></markdown>",
				"</edit>",
				"</pen-fast-apply>",
			].join("\n");
		});
		const editor = createChatEditor(model);
		await editor.whenReady();
		const { headingId, lastParagraphId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Turn the last paragraph into a bullet list",
			{ target: "document" },
		);

		expect(generation.status).toBe("complete");
		expect(generation.applyStrategy).toBe("markdown-fast-apply");
		expect(generation.mutationMode).toBe("direct-stream");
		expect(generation.mutationReceipt?.status).toBe("applied");

		const blocks = Array.from(editor.blocks());
		expect(blocks.map((block) => block.type)).toEqual([
			"heading",
			"paragraph",
			"bulletListItem",
			"bulletListItem",
			"bulletListItem",
		]);
		const listItems = blocks.filter(
			(block) => block.type === "bulletListItem",
		);
		expect(listItems.map((block) => block.textContent())).toEqual([
			"Revenue grew",
			"Costs fell",
			"Margins improved",
		]);
		// Alignment reuses the replaced paragraph's identity for the first
		// list item instead of delete-and-insert.
		expect(editor.getBlock(lastParagraphId)?.type).toBe("bulletListItem");
		expect(editor.getBlock(headingId)?.textContent()).toBe(
			"Quarterly Report",
		);
		// Direct preference: the edit landed, nothing is parked as suggestions.
		expect(controller.getSuggestions()).toHaveLength(0);

		editor.destroy();
	});

	it("handles a multi-part edit: friendlier title, extended paragraph, and a new table", async () => {
		const model = fastApplyModel((annotations) => {
			const heading = annotations.find(
				(annotation) => annotation.type === "heading",
			);
			const lastParagraph = annotations
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			expect(heading).toBeTruthy();
			expect(lastParagraph).toBeTruthy();
			return [
				"<pen-fast-apply>",
				"<instructions>I am softening the title, extending the closing paragraph, and adding the matrix table.</instructions>",
				"<scope>section</scope>",
				"<edit>",
				"<operation>replace_text</operation>",
				`<blockId>${heading!.id}</blockId>`,
				"<expectedBlockType>heading</expectedBlockType>",
				"<text><![CDATA[Our Quarter in Review]]></text>",
				"</edit>",
				"<edit>",
				"<operation>append_text</operation>",
				`<blockId>${lastParagraph!.id}</blockId>`,
				"<text><![CDATA[ The matrix below breaks this down.]]></text>",
				"</edit>",
				"<edit>",
				"<operation>insert_after</operation>",
				`<blockId>${lastParagraph!.id}</blockId>`,
				"<markdown><![CDATA[| Metric | Change |",
				"| --- | --- |",
				"| Revenue | +12% |",
				"| Costs | -8% |",
				"]]></markdown>",
				"</edit>",
				"</pen-fast-apply>",
			].join("\n");
		});
		const editor = createChatEditor(model);
		await editor.whenReady();
		const { headingId, lastParagraphId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Edit the title and make it friendlier, then extend the last paragraph with some more text and a table showing the matrix.",
			{ target: "document" },
		);

		expect(generation.status).toBe("complete");
		expect(generation.mutationReceipt?.status).toBe("applied");

		expect(editor.getBlock(headingId)?.textContent()).toBe(
			"Our Quarter in Review",
		);
		expect(editor.getBlock(lastParagraphId)?.textContent()).toBe(
			"Revenue grew. Costs fell. Margins improved. The matrix below breaks this down.",
		);
		const blocks = Array.from(editor.blocks());
		const table = blocks.find((block) => block.type === "table");
		expect(table).toBeTruthy();
		expect(controller.getSuggestions()).toHaveLength(0);

		editor.destroy();
	});

	it("EC12: the default channel still applies a document-edit prompt", async () => {
		const model = fastApplyModel((annotations) => {
			const lastParagraph = annotations
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			expect(lastParagraph).toBeTruthy();
			return [
				"<pen-fast-apply>",
				"<instructions>I am converting the last paragraph into a bullet list.</instructions>",
				"<scope>single-block</scope>",
				"<edit>",
				"<operation>replace_blocks</operation>",
				`<block>${lastParagraph!.id}</block>`,
				"<markdown><![CDATA[- Revenue grew",
				"- Costs fell",
				"- Margins improved",
				"]]></markdown>",
				"</edit>",
				"</pen-fast-apply>",
			].join("\n");
		});
		const editor = createChatEditor(model);
		await editor.whenReady();
		const { lastParagraphId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Turn the last paragraph into a bullet list",
			{ target: "document" },
		);

		expect(generation.applyStrategy).not.toBe("tool-edit");
		expect(
			Array.from(editor.blocks()).some(
				(block) => block.type === "bulletListItem",
			),
		).toBe(true);
		expect(editor.getBlock(lastParagraphId)?.type).not.toBe("paragraph");

		editor.destroy();
	});
});
