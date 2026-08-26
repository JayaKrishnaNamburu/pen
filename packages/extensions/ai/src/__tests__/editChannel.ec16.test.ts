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
	ToolSchema,
} from "@input/pen-types";
import { runAgenticLoop } from "../index";

const ANNOTATED_CONTEXT =
	"<!-- block:title heading -->\nTitle\n<!-- block:closing paragraph -->\nRevenue grew.";

const ANNOTATED_EDIT_TOOL_NAMES = ["edit_document"] as const;

const UNANNOTATED_EDIT_TOOL_NAMES = [
	"read_document",
	"get_context",
	"get_cursor_context",
	"search_document",
	"retrieve_document_spans",
	"list_block_types",
	"edit_document",
] as const;

interface CapturedRequest {
	tools: string[];
	messages: unknown;
}

function toolNames(tools: readonly ToolSchema[] | undefined): string[] {
	return (tools ?? []).map((tool) => tool.name);
}

function capturingModel(
	eventsForPass: (
		pass: number,
		request: CapturedRequest,
	) => ModelStreamEvent[],
): { adapter: ModelAdapter; captured: () => CapturedRequest[] } {
	const captured: CapturedRequest[] = [];
	const adapter: ModelAdapter = {
		async *stream(request) {
			const snapshot: CapturedRequest = {
				tools: toolNames(request.tools),
				messages: request.messages,
			};
			captured.push(snapshot);
			for (const event of eventsForPass(captured.length, snapshot)) {
				yield event;
			}
		},
	};
	return { adapter, captured: () => captured };
}

async function createLoopEditor() {
	const editor = createEditor({
		schema: defaultSchema,
		extensions: [undoExtension(), documentOpsExtension()],
	});
	await editor.whenReady();
	return editor;
}

function annotatedWorkingSet() {
	return {
		documentVersion: 1,
		viewMode: "resolved" as const,
		source: "document-summary" as const,
		context: ANNOTATED_CONTEXT,
		trackedBlockIds: ["title", "closing"],
		selectionSignature: null,
	};
}

function unannotatedWorkingSet() {
	return {
		documentVersion: 1,
		viewMode: "resolved" as const,
		source: "document-summary" as const,
		context: "A document with no block annotations.",
		trackedBlockIds: [] as string[],
		selectionSignature: null,
	};
}

describe("EC16: every pass pays for the tools it is offered", () => {
	it("EC16: an annotated tool-edit pass offers only edit_document", async () => {
		const { adapter, captured } = capturingModel(() => [{ type: "done" }]);
		const editor = await createLoopEditor();
		const toolRuntime = getDocumentToolRuntime(editor)!;

		await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "Shorten the closing paragraph.",
			blockId: editor.firstBlock()!.id,
			editsArriveAsToolCalls: true,
			allowedMutatingTools: ["edit_document"],
			workingSet: annotatedWorkingSet(),
		});

		expect(captured()[0]?.tools).toEqual([...ANNOTATED_EDIT_TOOL_NAMES]);

		editor.destroy();
	});

	it("EC16: an unannotated tool-edit pass keeps discovery reads plus edit_document", async () => {
		const { adapter, captured } = capturingModel(() => [{ type: "done" }]);
		const editor = await createLoopEditor();
		const toolRuntime = getDocumentToolRuntime(editor)!;

		await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "Read the document, then edit.",
			blockId: editor.firstBlock()!.id,
			editsArriveAsToolCalls: true,
			allowedMutatingTools: ["edit_document"],
			workingSet: unannotatedWorkingSet(),
		});

		expect(captured()[0]?.tools).toEqual([...UNANNOTATED_EDIT_TOOL_NAMES]);

		editor.destroy();
	});

	it("EC10/EC5: a refuse-then-correct turn still completes with the trimmed offer", async () => {
		const { adapter, captured } = capturingModel((pass) => {
			if (pass === 1) {
				return [
					{
						type: "tool-call",
						toolCallId: "edit-bad",
						toolName: "edit_document",
						input: {
							operations: [
								{
									operation: "replace_block_text",
									blockId: "does-not-exist",
									text: "Should not land.",
								},
							],
						},
					},
					{ type: "done" },
				];
			}
			return [
				{
					type: "tool-call",
					toolCallId: "edit-ok",
					toolName: "edit_document",
					input: {
						operations: [
							{
								operation: "replace_block_text",
								blockId: "closing",
								text: "Corrected closing.",
							},
						],
					},
				},
				{ type: "done" },
			];
		});
		const editor = await createLoopEditor();
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: editor.firstBlock()!.id,
					from: 0,
					to: 0,
					insert: "Keep me.",
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
					insert: "Revenue grew.",
				},
			],
			{ origin: "system" },
		);
		const toolRuntime = getDocumentToolRuntime(editor)!;

		const generation = await runAgenticLoop({
			model: adapter,
			editor,
			toolRuntime,
			prompt: "Rewrite the closing paragraph.",
			blockId: editor.firstBlock()!.id,
			editsArriveAsToolCalls: true,
			allowedMutatingTools: ["edit_document"],
			workingSet: annotatedWorkingSet(),
		});

		expect(generation.status).toBe("complete");
		expect(captured()).toHaveLength(2);
		expect(captured()[0]?.tools).toEqual([...ANNOTATED_EDIT_TOOL_NAMES]);
		expect(captured()[1]?.tools).toEqual([...ANNOTATED_EDIT_TOOL_NAMES]);
		expect(JSON.stringify(captured()[1]?.messages)).toContain(
			"unknown-block",
		);
		expect(editor.getBlock("closing")?.textContent()).toBe(
			"Corrected closing.",
		);

		editor.destroy();
	});
});
