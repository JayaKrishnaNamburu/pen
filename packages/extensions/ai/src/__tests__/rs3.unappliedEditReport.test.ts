import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { toolsExtension } from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { aiExtension, getAIController } from "../index";
import { deltaStreamExtension } from "../stream";
import type { AgenticStep } from "../types";
import {
	calledEditTool,
	editToolAccountedForEdit,
	EDIT_NOT_APPLIED_REASON,
	isUnappliedEdit,
} from "../controller/unappliedEdit";

/**
 * RS3, the reporting half: a turn asked for an edit, landed nothing, and said
 * nothing about why.
 *
 * The report used to key on the apply strategy — `markdown-full-replace` with a
 * `noop` receipt, the signature of a text-parsed plan that failed to compile.
 * UC3 deleted that channel, so the guard watched nothing, and UC5 deleted the
 * vocabulary it read. What replaces it is evidence from the turn itself: the
 * edit tool was called, and no outcome accounts for it.
 *
 * The distinction that makes this expressible is UC8's: on this lane, text with
 * no document change is usually an answer to a question, and the only thing
 * separating an answer from a lost edit is whether the mutating tool was called.
 */

const BLOCK_ANNOTATION_PATTERN = /<!-- block:(\S+) (\S+) -->/g;

describe("RS3: a lost edit is reported, an answer and a refusal are not", () => {
	it("RS3: an edit tool call that accounts for nothing is a lost edit", () => {
		const steps: AgenticStep[] = [
			toolCall({ output: { ok: true, appliedOperations: [] } }),
		];

		expect(calledEditTool(steps)).toBe(true);
		expect(editToolAccountedForEdit(steps)).toBe(false);
		expect(
			isUnappliedEdit({
				editAttempted: calledEditTool(steps),
				editAccountedFor: editToolAccountedForEdit(steps),
				receiptStatus: "noop",
				suggestionCount: 0,
			}),
		).toBe(true);
	});

	it("RS3: a turn that never called the edit tool is an answer", () => {
		const steps: AgenticStep[] = [
			{ index: 0, type: "text", status: "complete" },
			{
				index: 1,
				type: "tool-call",
				toolName: "read_document",
				toolCallId: "call-read",
				output: { ok: true },
				status: "complete",
			},
		];

		expect(calledEditTool(steps)).toBe(false);
		expect(
			isUnappliedEdit({
				editAttempted: calledEditTool(steps),
				editAccountedFor: editToolAccountedForEdit(steps),
				receiptStatus: "noop",
				suggestionCount: 0,
			}),
		).toBe(false);
	});

	/*
	 * A refusal is informative (EC5) and is retried inside the turn rather than
	 * surfacing as a failed generation (EC10), so every refusal shape has to
	 * read as accounted for — including the two the loop records on the
	 * `tool-call` step because the refusal short-circuits before a `tool-result`
	 * exists.
	 */
	const accountedFor: Array<{ label: string; steps: AgenticStep[] }> = [
		{
			label: "a semantic rejection",
			steps: [
				toolCall({
					output: {
						ok: false,
						appliedOperations: [],
						rejected: [{ index: 0, reason: "unknown-block" }],
					},
				}),
			],
		},
		{
			label: "an authority denial",
			steps: [
				toolCall({
					output: {
						ok: false,
						status: "denied",
						reason: "not-allowed",
					},
				}),
			],
		},
		{
			label: "a step that errored",
			steps: [toolCall({ output: undefined, status: "error" })],
		},
		{
			label: "a partial apply",
			steps: [
				toolResult({
					output: {
						ok: false,
						appliedOperations: ["replace_block_text"],
						rejected: [{ index: 1, reason: "unknown-block" }],
					},
				}),
			],
		},
		{
			label: "a clean apply",
			steps: [
				toolResult({
					output: {
						ok: true,
						appliedOperations: ["replace_block_text"],
					},
				}),
			],
		},
	];

	for (const { label, steps } of accountedFor) {
		it(`RS3: ${label} is accounted for, not a lost edit`, () => {
			expect(editToolAccountedForEdit(steps)).toBe(true);
			expect(
				isUnappliedEdit({
					editAttempted: true,
					editAccountedFor: editToolAccountedForEdit(steps),
					receiptStatus: "noop",
					suggestionCount: 0,
				}),
			).toBe(false);
		});
	}

	it("RS3: staged work is an outcome, not a lost edit", () => {
		expect(
			isUnappliedEdit({
				editAttempted: true,
				editAccountedFor: false,
				receiptStatus: "staged_suggestions",
				suggestionCount: 2,
			}),
		).toBe(false);
	});

	/*
	 * The old key. A markdown block generation lands through the text commit
	 * path, never calls a tool, and can still finish `noop` — which is what the
	 * deleted `markdown-full-replace` guard fired on. It must not be reported
	 * now: nothing asked for a durable edit through the channel.
	 */
	it("RS3: the report no longer fires on a text lane that landed nothing", () => {
		expect(
			isUnappliedEdit({
				editAttempted: false,
				editAccountedFor: false,
				receiptStatus: "noop",
				suggestionCount: 0,
			}),
		).toBe(false);
	});

	it("RS3: a question turn on the edit channel reports nothing", async () => {
		const { editor, controller } = editChannelEditor(answeringModel());
		try {
			const generation = await controller.runPrompt(
				"What does the closing paragraph say?",
				{ target: "document" },
			);

			expect(generation.status).toBe("complete");
			expect(generation.turnReason ?? null).not.toBe(
				EDIT_NOT_APPLIED_REASON,
			);
			expect(calledEditTool(generation.steps)).toBe(false);
		} finally {
			editor.destroy();
		}
	});

	it("RS3: an edit turn that lands its call reports nothing", async () => {
		const { editor, controller } = editChannelEditor(
			editingModel((annotations) => [
				{
					operation: "replace_block_text",
					blockId: annotations.at(-1)?.id ?? "missing",
					text: "Rewritten.",
				},
			]),
		);
		try {
			const generation = await controller.runPrompt(
				"Rewrite the closing paragraph.",
				{ target: "document" },
			);

			expect(calledEditTool(generation.steps)).toBe(true);
			expect(editToolAccountedForEdit(generation.steps)).toBe(true);
			expect(generation.status).toBe("complete");
			expect(generation.turnReason ?? null).not.toBe(
				EDIT_NOT_APPLIED_REASON,
			);
		} finally {
			editor.destroy();
		}
	});

	it("RS3: an edit turn that is refused completes rather than reporting", async () => {
		const { editor, controller } = editChannelEditor(
			editingModel(() => [
				{
					operation: "replace_block_text",
					blockId: "no-such-block",
					text: "Rewritten.",
				},
			]),
		);
		try {
			const generation = await controller.runPrompt(
				"Rewrite the closing paragraph.",
				{ target: "document" },
			);

			expect(calledEditTool(generation.steps)).toBe(true);
			expect(editToolAccountedForEdit(generation.steps)).toBe(true);
			// EC10: a refusal is retried in the turn, not a failed generation.
			expect(generation.status).toBe("complete");
			expect(generation.turnReason ?? null).not.toBe(
				EDIT_NOT_APPLIED_REASON,
			);
		} finally {
			editor.destroy();
		}
	});
});

interface Annotation {
	id: string;
	type: string;
}

function toolCall(input: {
	output: unknown;
	status?: AgenticStep["status"];
}): AgenticStep {
	return {
		index: 0,
		type: "tool-call",
		toolName: "edit_document",
		toolCallId: "call-1",
		output: input.output,
		status: input.status ?? "complete",
	};
}

function toolResult(input: { output: unknown }): AgenticStep {
	return {
		index: 1,
		type: "tool-result",
		toolName: "edit_document",
		toolCallId: "call-1",
		output: input.output,
		status: "complete",
	};
}

function annotationsFromRequest(request: { messages: unknown }): Annotation[] {
	const serialized = JSON.stringify(request.messages);
	return [...serialized.matchAll(BLOCK_ANNOTATION_PATTERN)].map((match) => ({
		id: match[1]!,
		type: match[2]!,
	}));
}

/** Answers in prose and calls nothing, which is what a question looks like. */
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

function editingModel(
	buildOperations: (annotations: Annotation[]) => unknown[],
): ModelAdapter {
	let passes = 0;
	return {
		async *stream(request) {
			passes += 1;
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
}

function editChannelEditor(model: ModelAdapter) {
	const editor = createEditor({
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
