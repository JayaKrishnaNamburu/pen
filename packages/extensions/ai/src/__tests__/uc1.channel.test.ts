import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";

/**
 * UC1: there is no channel option. The tool channel is what a host gets
 * without selecting one (`spec/rules/ai.md` UC1). GATE 1.5 already
 * greps the deleted vocabulary out of source; this file claims the runtime.
 */

function talkingModel(text: string): ModelAdapter {
	return {
		async *stream() {
			yield { type: "text-delta", delta: text } as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
}

function createChatEditor(model: ModelAdapter) {
	return createEditor({
		schema: defaultSchema,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			toolsExtension(),
			aiExtension({
				model,
				contentFormat: { blockGeneration: "markdown" },
				mutationPreference: "direct",
				allowedMutatingTools: ["edit_document"],
			}),
		],
	});
}

function seedDocument(editor: ReturnType<typeof createEditor>): void {
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
}

function channelKeys(value: object): string[] {
	return Object.getOwnPropertyNames(value).filter((key) =>
		/channel/i.test(key),
	);
}

describe("UC1: the tool channel is the only edit channel", () => {
	it("UC1: the resolved controller surface has no channel option", async () => {
		const editor = createChatEditor(talkingModel("ok"));
		await editor.whenReady();
		const controller = getAIController(editor)!;

		expect(controller).toBeTruthy();
		expect(
			channelKeys(controller.getState()),
			"a channel key on getState() is the deleted option coming back",
		).toEqual([]);
		expect(
			channelKeys(controller),
			"a channel field on the controller is a knob even if getState() hides it",
		).toEqual([]);

		editor.destroy();
	});

	it("UC1: a generation with no channel config mounts the tool channel", async () => {
		let advertised: string[] = [];
		const editor = createChatEditor({
			async *stream(request) {
				advertised = (request.tools ?? []).map((tool) => tool.name);
				yield { type: "done" } as ModelStreamEvent;
			},
		});
		await editor.whenReady();
		seedDocument(editor);

		const generation = await getAIController(editor)!.runPrompt(
			"Shorten the last paragraph",
			{ target: "document" },
		);

		expect(generation.route).toBe("tool-loop");
		expect(generation.editsArriveAsToolCalls).toBe(true);
		expect(advertised).toContain("edit_document");

		editor.destroy();
	});
});
