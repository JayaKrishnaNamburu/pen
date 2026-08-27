import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import {
	toolsExtension,
	getDocumentToolRuntime,
} from "@input/pen-tools";
import { defaultSchema } from "@input/pen-schema";
import { undoExtension } from "@input/pen-undo";
import type { ModelAdapter, ModelStreamEvent } from "@input/pen-types";
import { runAgenticLoop } from "../index";
import { AI_EDIT_DOCUMENT_TOOL_NAME } from "../tools/constants";
import { advertiseAIToolsForRoute, listAITools } from "../tools/descriptors";

/**
 * UC6: the loop knows the mutating tool's name and the forcing rule.
 * Payload shape, refusal payloads, and retry shaping live with the
 * executor (`runtime/editDocumentPreview.ts`, `runtime/viewHashes.ts`,
 * `@input/pen-tools`).
 */

const LOOP_SOURCE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "../agentic/loop.ts"),
	"utf8",
);

const EDIT_PAYLOAD_SHAPE_NAMES = [
	"replace_block_text",
	"replace_blocks",
	"insert_blocks",
	"delete_blocks",
	"format_text",
	"set_block_props",
];

describe("UC6: the loop's forcing decision carries only the tool name", () => {
	it("UC6: the loop source does not encode the edit payload shape", () => {
		expect(LOOP_SOURCE).toContain("AI_EDIT_DOCUMENT_TOOL_NAME");
		for (const name of EDIT_PAYLOAD_SHAPE_NAMES) {
			expect(
				LOOP_SOURCE.includes(name),
				`loop.ts still names payload op ${name}`,
			).toBe(false);
		}
	});

	it("UC6: an annotated edit-intent pass forces the tool by name", async () => {
		let toolChoice: unknown;
		const adapter: ModelAdapter = {
			capabilities: { forcedToolChoice: true },
			async *stream(request) {
				toolChoice = request.toolChoice;
				yield { type: "done" } as ModelStreamEvent;
			},
		};
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), toolsExtension()],
		});
		await editor.whenReady();
		try {
			await runAgenticLoop({
				model: adapter,
				editor,
				toolRuntime: getDocumentToolRuntime(editor)!,
				prompt: "Shorten the closing paragraph.",
				blockId: editor.firstBlock()!.id,
				editsArriveAsToolCalls: true,
				workingSet: {
					documentVersion: 1,
					viewMode: "resolved",
					source: "document-summary",
					context:
						"<!-- block:closing paragraph -->\nRevenue grew. Costs fell.",
					trackedBlockIds: ["closing"],
					selectionSignature: null,
				},
			});
			expect(toolChoice).toEqual({
				type: "tool",
				name: AI_EDIT_DOCUMENT_TOOL_NAME,
			});
		} finally {
			editor.destroy();
		}
	});

	it("UC6: host-facing mutators stay off an in-editor edit-channel advertise", () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), toolsExtension()],
		});
		const runtime = getDocumentToolRuntime(editor)!;
		const granted = listAITools(runtime, {
			allowedMutatingTools: [AI_EDIT_DOCUMENT_TOOL_NAME],
		});
		const advertised = advertiseAIToolsForRoute(granted, {
			editChannel: true,
			hasBlockAnnotations: true,
		});
		expect(advertised.map((tool) => tool.name)).toEqual([
			AI_EDIT_DOCUMENT_TOOL_NAME,
		]);
		editor.destroy();
	});
});
