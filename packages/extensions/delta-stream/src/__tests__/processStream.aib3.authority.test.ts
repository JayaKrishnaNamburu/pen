import { createEditor } from "@input/pen-core";
import { documentOpsExtension } from "@input/pen-document-ops";
import { defaultSchema } from "@input/pen-schema-default";
import type { DiagnosticEvent, PenStreamPart } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { deltaStreamExtension } from "../deltaStreamExtension";
import { processStream } from "../processStream";

function createLiveEditor() {
	return createEditor({
		schema: defaultSchema,
		extensions: [documentOpsExtension(), deltaStreamExtension()],
	});
}

async function* createStream(
	parts: PenStreamPart[],
): AsyncIterable<PenStreamPart> {
	for (const part of parts) {
		yield part;
	}
}

function listenDiagnostics(
	editor: ReturnType<typeof createEditor>,
): DiagnosticEvent[] {
	const diagnostics: DiagnosticEvent[] = [];
	editor.on("diagnostic", (event) => {
		diagnostics.push(event);
	});
	return diagnostics;
}

function documentTexts(editor: ReturnType<typeof createEditor>): string[] {
	return [...editor.blocks()].map((block) =>
		block.textContent({ resolved: true }),
	);
}

describe("AIB3 processStream tool authority", () => {
	it("AIB3: tool-input-available cannot mutate the document without a grant", async () => {
		const editor = createLiveEditor();
		await editor.whenReady();
		const diagnostics = listenDiagnostics(editor);
		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId: seedId, offset: 0, text: "seed" }],
			{ origin: "user" },
		);
		const before = documentTexts(editor);
		const beforeIds = [...editor.blocks()].map((block) => block.id);
		const emitted: PenStreamPart[] = [];

		await processStream(
			createStream([
				{
					type: "tool-input-available",
					toolCallId: "hostile-1",
					toolName: "insert_block",
					input: {
						position: "last",
						blockType: "paragraph",
						content: "hostile-write",
					},
				},
				{
					type: "tool-input-available",
					toolCallId: "hostile-2",
					toolName: "write_document",
					input: {
						content: "hostile-replace",
					},
				},
			]),
			editor,
			{ onPart: (part) => emitted.push(part) },
		);

		expect(documentTexts(editor)).toEqual(before);
		expect([...editor.blocks()].map((block) => block.id)).toEqual(beforeIds);
		expect(JSON.stringify(documentTexts(editor))).not.toContain(
			"hostile-write",
		);
		expect(JSON.stringify(documentTexts(editor))).not.toContain(
			"hostile-replace",
		);
		expect(
			emitted.filter((part) => part.type === "tool-error").map((part) => ({
				toolCallId: "toolCallId" in part ? part.toolCallId : null,
				error: "error" in part ? part.error : null,
			})),
		).toEqual([
			{ toolCallId: "hostile-1", error: "tool-not-allowed" },
			{ toolCallId: "hostile-2", error: "tool-not-allowed" },
		]);
		expect(
			diagnostics.filter((event) => event.code === "stream-tool-error"),
		).toHaveLength(2);

		editor.destroy();
	});

	it("AIB3: a granted read-only tool still runs from tool-input-available", async () => {
		const editor = createLiveEditor();
		await editor.whenReady();
		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[{ type: "insert-text", blockId: seedId, offset: 0, text: "seed" }],
			{ origin: "user" },
		);
		const before = documentTexts(editor);
		const emitted: PenStreamPart[] = [];

		await processStream(
			createStream([
				{
					type: "tool-input-available",
					toolCallId: "read-1",
					toolName: "search_document",
					input: { query: "seed" },
				},
			]),
			editor,
			{ onPart: (part) => emitted.push(part) },
		);

		expect(documentTexts(editor)).toEqual(before);
		expect(emitted.some((part) => part.type === "tool-output")).toBe(true);
		expect(emitted.some((part) => part.type === "tool-error")).toBe(false);

		editor.destroy();
	});
});
