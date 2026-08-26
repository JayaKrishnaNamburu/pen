import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	documentOpsExtension,
	getDocumentToolRuntime,
} from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import { createModelDouble } from "@input/pen-test";
import { undoExtension } from "@input/pen-undo";
import { type PenStreamRequest } from "@input/pen-types";
import { AI_TOOL_RESULT_MAX_CHARS, runAgenticLoop } from "../index";

type AssertFalse<T extends false> = T;
// Compile-time: a top-level `editor` on PenStreamRequest fails typecheck.
// Nested `context.editor` is still declared — the grep gate covers that.
type _PenStreamRequestHasNoEditor = AssertFalse<
	"editor" extends keyof PenStreamRequest ? true : false
>;

async function awaitExtensionLifecycle(
	editor: ReturnType<typeof createEditor>,
): Promise<void> {
	await editor.whenReady();
}

describe("AIB2 agentic tool-result send bounds", () => {
	it("AIB2: a tool result far larger than AI_TOOL_RESULT_MAX_CHARS is compacted before it reaches the adapter", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), documentOpsExtension()],
		});
		await awaitExtensionLifecycle(editor);
		const toolRuntime = getDocumentToolRuntime(editor);
		expect(toolRuntime).toBeTruthy();

		const oversized = "X".repeat(AI_TOOL_RESULT_MAX_CHARS * 4);
		expect(oversized.length).toBeGreaterThan(AI_TOOL_RESULT_MAX_CHARS);

		toolRuntime!.registerTool({
			name: "read_blob",
			description: "Returns a large read-only blob",
			mutating: false,
			inputSchema: {
				type: "object",
				properties: {},
			},
			async handler() {
				return oversized;
			},
		});

		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: seedId,
					from: 0,
					to: 0,
					insert: "seed",
				},
			],
			{ origin: "user" },
		);

		const double = createModelDouble({
			responses: [
				{
					toolCalls: [
						{
							toolCallId: "blob-1",
							toolName: "read_blob",
							input: {},
						},
					],
				},
				{ text: "done" },
			],
		});

		await runAgenticLoop({
			model: double,
			editor,
			toolRuntime: toolRuntime!,
			prompt: "Inspect the blob",
			blockId: seedId,
		});

		expect(double.requests.length).toBeGreaterThanOrEqual(2);
		const followUp = double.requests.find((request) =>
			request.documentExcerpts.some(
				(excerpt) => excerpt.kind === "tool-result",
			),
		);
		expect(followUp).toBeTruthy();
		expect(followUp!.feature).toBe("agentic-step");

		const toolResults = followUp!.documentExcerpts.filter(
			(excerpt) => excerpt.kind === "tool-result",
		);
		expect(toolResults).toHaveLength(1);
		const compacted = toolResults[0]!.text;
		// Truncation is explicit: the marker tells the model content was cut
		// and how to recover, instead of ending on a bare ellipsis.
		expect(compacted).toMatch(/… \[truncated \d+ chars/);
		expect(compacted.length).toBeLessThanOrEqual(
			AI_TOOL_RESULT_MAX_CHARS + 100,
		);
		expect(compacted.length).toBeLessThan(oversized.length);
		expect(compacted).not.toContain(oversized);
		expect(JSON.stringify(followUp!.messages)).not.toContain(oversized);

		editor.destroy();
	});
});
