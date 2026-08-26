import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	documentOpsExtension,
	getDocumentToolRuntime,
} from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type {
	ModelAdapter,
	ModelStreamEvent,
	ModelToolChoice,
} from "@input/pen-types";
import { aiExtension, getAIController, runAgenticLoop } from "../index";
import { deltaStreamExtension } from "../stream";

interface CapturedRequest {
	toolChoice?: ModelToolChoice;
	messages: unknown;
}

function capturingModel(
	capabilities: ModelAdapter["capabilities"],
	events: ModelStreamEvent[],
): { adapter: ModelAdapter; captured: () => CapturedRequest[] } {
	const captured: CapturedRequest[] = [];
	const adapter: ModelAdapter = {
		capabilities,
		async *stream(request) {
			captured.push({
				toolChoice: request.toolChoice,
				messages: request.messages,
			});
			for (const event of events) {
				yield event;
			}
		},
	};
	return { adapter, captured: () => captured };
}

describe("EC17: an edit-intent pass uses the provider's guarantees where they exist", () => {
	it("EC17: annotations in context send the forced edit-tool choice", async () => {
		const { adapter, captured } = capturingModel(
			{ forcedToolChoice: true },
			[{ type: "done" }],
		);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), documentOpsExtension()],
		});
		await editor.whenReady();
		const toolRuntime = getDocumentToolRuntime(editor)!;

		await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "Shorten the closing paragraph.",
			blockId: editor.firstBlock()!.id,
			applyStrategy: "tool-edit",
			workingSet: {
				documentVersion: 1,
				viewMode: "resolved",
				source: "document-summary",
				context:
					"<!-- block:closing paragraph -->\nRevenue grew. Costs fell.",
				trackedBlockIds: ["closing"],
				blockRevisions: {},
				selectionSignature: null,
			},
		});

		expect(captured()[0]?.toolChoice).toEqual({
			type: "tool",
			name: "edit_document",
		});

		editor.destroy();
	});

	it("EC17: a pass without annotations sends any", async () => {
		const { adapter, captured } = capturingModel(
			{ forcedToolChoice: true },
			[{ type: "done" }],
		);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), documentOpsExtension()],
		});
		await editor.whenReady();
		const toolRuntime = getDocumentToolRuntime(editor)!;

		await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "Read the document, then edit.",
			blockId: editor.firstBlock()!.id,
			applyStrategy: "tool-edit",
			workingSet: {
				documentVersion: 1,
				viewMode: "resolved",
				source: "document-summary",
				context: "A document with no block annotations.",
				trackedBlockIds: [],
				blockRevisions: {},
				selectionSignature: null,
			},
		});

		expect(captured()[0]?.toolChoice).toEqual({ type: "any" });

		editor.destroy();
	});

	it("EC17: an adapter without forced-choice support sends neither and still ends under EC1", async () => {
		const { adapter, captured } = capturingModel(undefined, [
			{
				type: "text-delta",
				delta: "Here is a rewritten markdown copy of the document.",
			},
			{ type: "done" },
		]);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: adapter,
					contentFormat: { blockGeneration: "markdown" },
					mutationPreference: "direct",
					allowedMutatingTools: ["edit_document"],
				}),
			],
		});
		await editor.whenReady();
		const headingId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: headingId,
					from: 0,
					to: 0,
					insert: "Keep me.",
				},
			],
			{ origin: "system" },
		);
		const before = editor.getBlock(headingId)!.textContent();

		const generation = await getAIController(editor)!.runPrompt(
			"Improve the text.",
			{ target: "document" },
		);

		expect(captured()[0]?.toolChoice).toBeUndefined();
		expect(generation.status).toBe("complete");
		expect(generation.applyStrategy).toBe("tool-edit");
		expect(editor.getBlock(headingId)?.textContent()).toBe(before);
		expect(editor.blockCount()).toBe(1);

		editor.destroy();
	});

	it("EC17: a pass that is not edit intent sends no forced choice", async () => {
		const { adapter, captured } = capturingModel(
			{ forcedToolChoice: true },
			[{ type: "done" }],
		);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), documentOpsExtension()],
		});
		await editor.whenReady();
		const toolRuntime = getDocumentToolRuntime(editor)!;

		await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "What does the closing paragraph say?",
			blockId: editor.firstBlock()!.id,
			applyStrategy: "tool-edit",
			editIntent: false,
			workingSet: {
				documentVersion: 1,
				viewMode: "resolved",
				source: "document-summary",
				context:
					"<!-- block:closing paragraph -->\nRevenue grew. Costs fell.",
				trackedBlockIds: ["closing"],
				blockRevisions: {},
				selectionSignature: null,
			},
		});

		expect(captured()[0]?.toolChoice).toBeUndefined();

		editor.destroy();
	});

	it("EC17: a question answers instead of being forced into an edit", async () => {
		const { adapter, captured } = capturingModel(
			{ forcedToolChoice: true },
			[
				{ type: "text-delta", delta: "It covers revenue and costs." },
				{ type: "done" },
			],
		);
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [
				undoExtension(),
				deltaStreamExtension(),
				documentOpsExtension(),
				aiExtension({
					model: adapter,
					contentFormat: { blockGeneration: "markdown" },
					mutationPreference: "direct",
					allowedMutatingTools: ["edit_document"],
				}),
			],
		});
		await editor.whenReady();
		const headingId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: headingId,
					from: 0,
					to: 0,
					insert: "Quarterly report",
				},
			],
			{ origin: "system" },
		);
		const before = editor.getBlock(headingId)!.textContent();

		const generation = await getAIController(editor)!.runPrompt(
			"What is this document about?",
			{ target: "document" },
		);

		expect(captured()[0]?.toolChoice).toBeUndefined();
		expect(generation.status).toBe("complete");
		expect(editor.getBlock(headingId)?.textContent()).toBe(before);
		expect(editor.blockCount()).toBe(1);

		editor.destroy();
	});
});
