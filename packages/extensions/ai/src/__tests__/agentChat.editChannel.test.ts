import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";

/**
 * Agent-chat edits through `edit_document`. These run the whole chain the
 * playground runs — router lane, tool grant, agentic loop, tool handler,
 * apply — so a durable edit is proven end to end rather than only at the
 * handler (`spec/packages/extensions/ai.md` EC1).
 */

const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) (\S+) -->/g;

interface Annotation {
	id: string;
	type: string;
}

function annotationsFromRequest(request: { messages: unknown }): Annotation[] {
	const serialized = JSON.stringify(request.messages);
	return [...serialized.matchAll(BLOCK_ANNOTATION_PATTERN)].map((match) => ({
		id: match[1]!,
		type: match[2]!,
	}));
}

/**
 * A model that answers with one `edit_document` call built from the block ids
 * it found in the request, then stops. The second pass yields nothing, which
 * is how a real model ends a turn once its tool has run.
 */
function editChannelModel(
	buildOperations: (annotations: Annotation[]) => unknown[],
): { adapter: ModelAdapter; passes: () => number } {
	let passes = 0;
	const adapter: ModelAdapter = {
		async *stream(request) {
			passes += 1;
			// Pass-counted, not keyword-sniffed: the tool channel's prompt names
			// `edit_document` itself, so looking for that string in the request
			// would make this double stop before it ever called the tool.
			if (passes > 1) {
				yield { type: "done" } as ModelStreamEvent;
				return;
			}
			yield {
				type: "tool-call",
				toolCallId: `call-${passes}`,
				toolName: "edit_document",
				input: {
					operations: buildOperations(
						annotationsFromRequest(
							request as { messages: unknown },
						),
					),
				},
			} as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
	return { adapter, passes: () => passes };
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
				allowedMutatingTools: ["edit_document"],
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

describe("agent chat edits through the edit_document channel", () => {
	it("turns the last paragraph into a bullet list", async () => {
		const model = editChannelModel((annotations) => {
			const lastParagraph = annotations
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			expect(lastParagraph).toBeTruthy();
			return [
				{
					operation: "replace_blocks",
					blockIds: [lastParagraph!.id],
					markdown:
						"- Revenue grew\n- Costs fell\n- Margins improved\n",
				},
			];
		});
		const editor = createChatEditor(model.adapter);
		await editor.whenReady();
		const { headingId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Turn the last paragraph into a bullet list",
			{ target: "document" },
		);

		expect(generation.status).toBe("complete");
		expect(generation.route).toBe("tool-loop");
		expect(generation.editsArriveAsToolCalls).toBe(true);

		const blocks = Array.from(editor.blocks());
		expect(blocks.map((block) => block.type)).toEqual([
			"heading",
			"paragraph",
			"bulletListItem",
			"bulletListItem",
			"bulletListItem",
		]);
		expect(
			blocks
				.filter((block) => block.type === "bulletListItem")
				.map((block) => block.textContent()),
		).toEqual(["Revenue grew", "Costs fell", "Margins improved"]);
		expect(editor.getBlock(headingId)?.textContent()).toBe(
			"Quarterly Report",
		);
		expect(controller.getSuggestions()).toHaveLength(0);

		editor.destroy();
	});

	it("handles a multi-part edit in a single call", async () => {
		const model = editChannelModel((annotations) => {
			const heading = annotations.find(
				(annotation) => annotation.type === "heading",
			);
			const lastParagraph = annotations
				.filter((annotation) => annotation.type === "paragraph")
				.at(-1);
			expect(heading).toBeTruthy();
			expect(lastParagraph).toBeTruthy();
			return [
				{
					operation: "replace_block_text",
					blockId: heading!.id,
					text: "Our Quarter in Review",
				},
				{
					operation: "replace_block_text",
					blockId: lastParagraph!.id,
					text: "Revenue grew. Costs fell. Margins improved. The matrix below breaks this down.",
				},
				{
					operation: "insert_blocks",
					blockId: lastParagraph!.id,
					placement: "after",
					markdown:
						"| Metric | Change |\n| --- | --- |\n| Revenue | +12% |\n| Costs | -8% |\n",
				},
			];
		});
		const editor = createChatEditor(model.adapter);
		await editor.whenReady();
		const { headingId, lastParagraphId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(
			"Edit the title and make it friendlier, then extend the last paragraph with some more text and a table showing the matrix.",
			{ target: "document" },
		);

		expect(generation.status).toBe("complete");
		expect(editor.getBlock(headingId)?.textContent()).toBe(
			"Our Quarter in Review",
		);
		expect(editor.getBlock(lastParagraphId)?.textContent()).toBe(
			"Revenue grew. Costs fell. Margins improved. The matrix below breaks this down.",
		);
		expect(
			Array.from(editor.blocks()).some((block) => block.type === "table"),
		).toBe(true);
		// One read-free pass to edit, one to end the turn.
		expect(model.passes()).toBeLessThanOrEqual(2);

		editor.destroy();
	});
});

/**
 * A model that never calls a tool and only talks.
 *
 * This is the case the channel has to survive: the model ignores the tool and
 * answers with content instead. Whatever it says, the document must not move,
 * because on this channel text is conversation and the edit is a tool call
 * (`spec/packages/extensions/ai.md` EC1, EC6).
 */
function talkingModel(text: string): ModelAdapter {
	return {
		async *stream() {
			yield { type: "text-delta", delta: text } as ModelStreamEvent;
			yield { type: "done" } as ModelStreamEvent;
		},
	};
}

describe("EC1: on the tool channel, assistant text is not an edit", () => {
	const PROMPT = "Improve the text and make the last bit a bullet.";

	/**
	 * Plain markdown is the shape a real model actually produced here: asked to
	 * improve the document, Claude answered with a rewritten copy in markdown.
	 * The commit path read it as content for the target block and appended the
	 * whole thing, so the playground showed the document twice — the second copy
	 * "improved". Nothing rejected it, because a fallback that turns prose into
	 * blocks cannot tell a rewrite from an answer.
	 */
	it("does not append a markdown answer to the document", async () => {
		const editor = createChatEditor(
			talkingModel(
				[
					"# Pen playground",
					"",
					"This is a real Pen editor: type to edit it.",
					"",
					"- Open the panel on the right",
				].join("\n"),
			),
		);
		await editor.whenReady();
		seedDocument(editor);
		const before = Array.from(editor.blocks()).map((block) => ({
			id: block.id,
			type: block.type,
			text: block.textContent(),
		}));

		const controller = getAIController(editor)!;
		const generation = await controller.runPrompt(PROMPT, {
			target: "document",
		});

		expect(generation.editsArriveAsToolCalls).toBe(true);
		expect(
			Array.from(editor.blocks()).map((block) => ({
				id: block.id,
				type: block.type,
				text: block.textContent(),
			})),
		).toEqual(before);
		// Nothing landed, so the turn must not carry an "applied" receipt: a
		// channel that reports a write it did not make is unmeasurable.
		expect(generation.mutationReceipt?.status).toBe("noop");
		expect(controller.getSuggestions()).toHaveLength(0);

		editor.destroy();
	});

	// The probe named in `spec/packages/extensions/ai.md` EC1: a well-formed
	// payload for the *other* channel is still just text here. Unlike the
	// markdown probe above, this one also passed before the guard existed — the
	// markdown normalizer strips the wrapper and leaves nothing to insert — so it
	// locks the rule in rather than proving the fix. The red-proof is the
	// markdown case.
	it("does not honour a well-formed fast-apply payload sent as text", async () => {
		const editor = createChatEditor(talkingModel("placeholder"));
		await editor.whenReady();
		const { lastParagraphId } = seedDocument(editor);
		editor.destroy();

		const applying = createChatEditor(
			talkingModel(
				[
					// `pen-fast-apply` is deliberately spelled out, and must not be
					// renamed with our internal vocabulary. It is not a Pen symbol: it
					// is the tag a model trained on the *old* released contract will
					// emit, and it is the only string this regression is about. A
					// rename swept it to `pen-commit` — a tag no released
					// version ever accepted — which left the test asserting that an
					// invented string is inert. GATE 1.4 / GATE 2.1 grep for this
					// literal precisely so that a rename cannot quietly empty the
					// guard out; this file is expected to be their only match.
					"<pen-fast-apply>",
					"<instructions>Make the last paragraph a bullet.</instructions>",
					"<edit>",
					"<operation>replace_text</operation>",
					`<blockId>${lastParagraphId}</blockId>`,
					"<text>Revenue grew</text>",
					"</edit>",
					"</pen-fast-apply>",
				].join("\n"),
			),
		);
		await applying.whenReady();
		seedDocument(applying);
		const before = Array.from(applying.blocks()).map((block) =>
			block.textContent(),
		);

		const controller = getAIController(applying)!;
		await controller.runPrompt(PROMPT, { target: "document" });

		expect(
			Array.from(applying.blocks()).map((block) => block.textContent()),
		).toEqual(before);

		applying.destroy();
	});

	/**
	 * Refusing to apply text is only half the channel: the model also has to be
	 * asked for the tool. `tool-edit` used to fall through to the generic
	 * flow-markdown instructions ("Return only markdown content"), so the model
	 * was told to produce the one thing this channel throws away, and a live run
	 * did exactly that — a whole rewritten document as prose, and no edit.
	 */
	it("asks the model for a tool call rather than markdown content", async () => {
		let promptText = "";
		const editor = createChatEditor({
			async *stream(request) {
				promptText = JSON.stringify(request.messages);
				yield { type: "done" } as ModelStreamEvent;
			},
		});
		await editor.whenReady();
		seedDocument(editor);

		await getAIController(editor)!.runPrompt(PROMPT, {
			target: "document",
		});

		expect(promptText).toContain("edit_document");
		expect(promptText).not.toContain("Return only markdown content");

		editor.destroy();
	});

	// The positive control for both probes above: the same intent, sent as the
	// tool call, does change the document. Otherwise "nothing happened" could
	// just mean the channel is broken.
	it("applies the same intent when it arrives as a tool call", async () => {
		const model = editChannelModel((annotations) => [
			{
				operation: "replace_block_text",
				blockId: annotations
					.filter((annotation) => annotation.type === "paragraph")
					.at(-1)!.id,
				text: "Revenue grew",
			},
		]);
		const editor = createChatEditor(model.adapter);
		await editor.whenReady();
		const { lastParagraphId } = seedDocument(editor);

		const controller = getAIController(editor)!;
		await controller.runPrompt(PROMPT, { target: "document" });

		expect(editor.getBlock(lastParagraphId)?.textContent()).toBe(
			"Revenue grew",
		);

		editor.destroy();
	});
});
