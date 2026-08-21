import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema-default";
import type { PenStreamPart } from "@input/pen-types";
import { describe, expect, it } from "vitest";

import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../deltaStreamExtension";
import { processStream } from "../processStream";

function createDefaultEditor(
	options: Parameters<typeof createEditor>[0] = {},
) {
	return createEditor({
		schema: defaultSchema,
		...options,
		extensions: [
			undoExtension(),
			deltaStreamExtension(),
			...(options.extensions ?? []),
		],
	});
}

async function* createStream(parts: PenStreamPart[]) {
	for (const part of parts) {
		yield part;
	}
}

function visibleText(text: string): string {
	return text.replace(/\u200B/g, "");
}

describe("@input/pen-delta-stream processStream generation undo", () => {
	it("processes streamed AI deltas through the default delta-stream pipeline", async () => {
		const editor = createDefaultEditor();
		const blockId = editor.firstBlock()!.id;

		await processStream(
			createStream([
				{ type: "gen-start", zoneId: "zone-1", blockId },
				{ type: "gen-delta", zoneId: "zone-1", delta: "Hello " },
				{ type: "gen-delta", zoneId: "zone-1", delta: "world" },
				{ type: "gen-end", zoneId: "zone-1", status: "complete" },
			]),
			editor,
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"Hello world",
		);
		expect(
			editor.internals.getSlot<{ generationZone: unknown }>(
				"delta-stream:target",
			)?.generationZone ?? null,
		).toBeNull();

		editor.destroy();
	});

	it("keeps streamed AI generations in their own undo group", async () => {
		const editor = createDefaultEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: secondBlockId,
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "system" },
		);

		editor.apply(
			[
				{
					type: "insert-text",
					blockId: firstBlockId,
					offset: 0,
					text: "hello",
				},
			],
			{ origin: "user" },
		);

		await processStream(
			createStream([
				{ type: "gen-start", zoneId: "zone-2", blockId: secondBlockId },
				{ type: "gen-delta", zoneId: "zone-2", delta: "AI output" },
				{ type: "gen-end", zoneId: "zone-2", status: "complete" },
			]),
			editor,
		);

		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"hello",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"hello",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		editor.destroy();
	});

	it("keeps concurrent user edits outside the generation zone in a separate undo group", async () => {
		const editor = createDefaultEditor();
		const firstBlockId = editor.firstBlock()!.id;
		const secondBlockId = crypto.randomUUID();

		editor.apply(
			[
				{
					type: "insert-block",
					blockId: secondBlockId,
					blockType: "paragraph",
					props: {},
					position: "last",
				},
			],
			{ origin: "system" },
		);

		await processStream(
			(async function* (): AsyncIterable<PenStreamPart> {
				yield {
					type: "gen-start",
					zoneId: "zone-concurrent",
					blockId: secondBlockId,
				};

				editor.apply(
					[
						{
							type: "insert-text",
							blockId: firstBlockId,
							offset: 0,
							text: "user edit",
						},
					],
					{ origin: "user" },
				);

				yield {
					type: "gen-delta",
					zoneId: "zone-concurrent",
					delta: "AI output",
				};
				yield {
					type: "gen-end",
					zoneId: "zone-concurrent",
					status: "complete",
				};
			})(),
			editor,
		);

		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"user edit",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"user edit",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(firstBlockId)!.textContent())).toBe(
			"",
		);
		expect(visibleText(editor.getBlock(secondBlockId)!.textContent())).toBe(
			"",
		);

		editor.destroy();
	});

	it("keeps user edits inside the generation zone in the same undo group", async () => {
		const editor = createDefaultEditor();
		const blockId = editor.firstBlock()!.id;

		await processStream(
			(async function* (): AsyncIterable<PenStreamPart> {
				yield { type: "gen-start", zoneId: "zone-shared", blockId };
				yield {
					type: "gen-delta",
					zoneId: "zone-shared",
					delta: "AI ",
				};

				editor.apply(
					[
						{
							type: "insert-text",
							blockId,
							offset: 3,
							text: "user ",
						},
					],
					{ origin: "user" },
				);

				yield {
					type: "gen-delta",
					zoneId: "zone-shared",
					delta: "output",
				};
				yield {
					type: "gen-end",
					zoneId: "zone-shared",
					status: "complete",
				};
			})(),
			editor,
		);

		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"user AI output",
		);

		expect(editor.undoManager.undo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe("");

		expect(editor.undoManager.redo()).toBe(true);
		expect(visibleText(editor.getBlock(blockId)!.textContent())).toBe(
			"user AI output",
		);

		editor.destroy();
	});
});
