import { describe, expect, it } from "vitest";
import { createEditor } from "@input/pen-core";
import { defaultSchema } from "@input/pen-schema";
import type { PenStreamPart } from "@input/pen-types";
import { createModelDouble } from "@input/pen-test";
import { undoExtension } from "@input/pen-undo";
import { deltaStreamExtension } from "../deltaStreamExtension";
import { processStream } from "../processStream";

function blockTexts(editor: ReturnType<typeof createEditor>): string[] {
	return editor.documentState.blockOrder.map(
		(blockId) => editor.getBlock(blockId)?.textContent() ?? "",
	);
}

describe("AIB4 streamed apply undo", () => {
	it("AIB4: processStream applies are a single undo step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), deltaStreamExtension()],
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
			parts: [
				{
					type: "block-insert",
					blockId: "stream-a",
					blockType: "paragraph",
					position: "last",
				},
				{
					type: "block-insert",
					blockId: "stream-b",
					blockType: "paragraph",
					position: "last",
				},
			],
		});

		await processStream(
			double.streamParts() as AsyncIterable<PenStreamPart>,
			editor,
			{
				groupId: "stream-turn",
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(editor.getBlock("stream-a")).toBeTruthy();
		expect(editor.getBlock("stream-b")).toBeTruthy();
		expect(blockTexts(editor)[0]).toBe("seed");
		expect(editor.undoManager.undo()).toBe(true);
		expect(editor.getBlock("stream-a")).toBeNull();
		expect(editor.getBlock("stream-b")).toBeNull();
		expect(blockTexts(editor)).toEqual(["seed"]);
		expect(editor.undoManager.undo()).toBe(true);
		expect(blockTexts(editor)).toEqual([""]);

		editor.destroy();
	});

	it("AIB4 AIB5: an interrupted stream undoes to the pre-stream document", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), deltaStreamExtension()],
		});
		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: seedId,
					from: 0,
					to: 0,
					insert: "before",
				},
			],
			{ origin: "user" },
		);
		const before = blockTexts(editor);

		const double = createModelDouble({
			parts: [
				{ type: "gen-start", zoneId: "zone-1", blockId: seedId },
				{ type: "gen-delta", zoneId: "zone-1", delta: "Hello" },
				{
					type: "block-insert",
					blockId: "landed-prefix",
					blockType: "paragraph",
					position: "last",
				},
				{ type: "abort", reason: "cancelled" },
				{
					type: "block-insert",
					blockId: "after-abort",
					blockType: "paragraph",
					position: "last",
				},
			],
		});

		await processStream(
			double.streamParts() as AsyncIterable<PenStreamPart>,
			editor,
			{
				groupId: "abort-turn",
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(editor.getBlock("landed-prefix")).toBeTruthy();
		expect(editor.getBlock("after-abort")).toBeNull();
		expect(blockTexts(editor)).not.toEqual(before);

		expect(editor.undoManager.undo()).toBe(true);
		expect(blockTexts(editor)).toEqual(before);
		expect(editor.getBlock("landed-prefix")).toBeNull();

		editor.destroy();
	});

	it("AIB4 AIB5: signal cancel undoes the landed prefix as one step", async () => {
		const editor = createEditor({
			schema: defaultSchema,
			extensions: [undoExtension(), deltaStreamExtension()],
		});
		const seedId = editor.firstBlock()!.id;
		editor.apply(
			[
				{
					type: "splice-text",
					blockId: seedId,
					from: 0,
					to: 0,
					insert: "before",
				},
			],
			{ origin: "user" },
		);
		const before = blockTexts(editor);
		const controller = new AbortController();

		await processStream(
			(async function* () {
				yield {
					type: "gen-start",
					zoneId: "zone-1",
					blockId: seedId,
				} satisfies PenStreamPart;
				yield {
					type: "gen-delta",
					zoneId: "zone-1",
					delta: "Hello",
				} satisfies PenStreamPart;
				yield {
					type: "block-insert",
					blockId: "landed-prefix",
					blockType: "paragraph",
					position: "last",
				} satisfies PenStreamPart;
				controller.abort();
				yield {
					type: "block-insert",
					blockId: "after-signal",
					blockType: "paragraph",
					position: "last",
				} satisfies PenStreamPart;
			})(),
			editor,
			{
				signal: controller.signal,
				groupId: "signal-turn",
				allowedMutatingTools: ["insert_block"],
			},
		);

		expect(editor.getBlock("landed-prefix")).toBeTruthy();
		expect(editor.getBlock("after-signal")).toBeNull();
		expect(blockTexts(editor)).not.toEqual(before);

		expect(editor.undoManager.undo()).toBe(true);
		expect(blockTexts(editor)).toEqual(before);
		expect(editor.getBlock("landed-prefix")).toBeNull();

		editor.destroy();
	});
});
