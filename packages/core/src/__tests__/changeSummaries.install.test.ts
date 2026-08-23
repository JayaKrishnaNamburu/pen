import { yjsAdapter } from "@input/pen-crdt-yjs";
import { describe, expect, it } from "vitest";

import { createHeadlessEditor } from "../index";
import { defaultSchema } from "./fixtures/testSchema";

async function flushMicrotasks(count = 4): Promise<void> {
	for (let index = 0; index < count; index++) {
		await Promise.resolve();
	}
}

describe("change summaries — editor install", () => {
	it("copy-split mapPoint retargets a tail after same-apply insert-block+text", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const seed = editor.firstBlock()!.id;
		editor.apply([{ type: "delete-block", blockId: seed }]);
		editor.apply([
			{
				type: "insert-block",
				blockId: "b1",
				blockType: "paragraph",
				props: {},
				position: "last",
			},
			{ type: "insert-text", blockId: "b1", offset: 0, text: "meadow sage" },
		]);
		editor.selectText("b1", 9, 9);
		editor.apply([
			{
				type: "split-block",
				blockId: "b1",
				offset: 6,
				newBlockId: "b2",
			},
		]);
		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.mapPoint({ blockId: "b1", offset: 9 }, 1, "clamp")).toEqual({
			blockId: "b2",
			offset: 3,
		});
		expect(summary!.mapPoint({ blockId: "b1", offset: 6 }, 1, "clamp")).toEqual({
			blockId: "b2",
			offset: 0,
		});
		editor.destroy();
	});

	it("emits a summary for apply with mapped insert offsets", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.isEmpty).toBe(false);
		expect(summary!.text.some((change) => change.blockId === blockId)).toBe(
			true,
		);
		expect(summary!.mapOffset(blockId, 0, -1)).toBe(0);
		expect(summary!.mapOffset(blockId, 0, 1)).toBe(5);
		expect(editor.getBlock(blockId)?.textContent()).toBe("hello");

		editor.destroy();
	});

	it("I10: normalize stays inside the same apply summary", () => {
		const editor = createHeadlessEditor({ schema: defaultSchema });
		const blockId = editor.firstBlock()!.id;
		const before = editor.lastChangeSummary?.commitId ?? 0;

		editor.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "Hi",
			},
		]);

		const summary = editor.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.commitId).toBe(before + 1);
		expect(summary!.mapOffset(blockId, 0, 1)).toBe(2);
		expect(editor.summaryLog.latest()?.commitId).toBe(summary!.commitId);

		editor.destroy();
	});

	it("seeds the shadow index from an existing document", () => {
		const adapter = yjsAdapter();
		const document = adapter.createDocument();
		const writer = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter, document });
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);

		const reader = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter, document });
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "insert-text",
				blockId,
				offset: 5,
				text: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.mapOffset(blockId, 0, 1)).toBe(0);
		expect(summary!.mapOffset(blockId, 5, -1)).toBe(5);
		expect(summary!.mapOffset(blockId, 5, 1)).toBe(6);
		expect(reader.getBlock(blockId)?.textContent()).toBe("hello!");

		writer.destroy();
		reader.destroy();
	});

	it("reseeds the shadow index after loadDocument", async () => {
		const adapter = yjsAdapter();
		const writer = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter });
		const blockId = writer.firstBlock()!.id;
		writer.apply([
			{
				type: "insert-text",
				blockId,
				offset: 0,
				text: "hello",
			},
		]);
		const loaded = adapter.loadDocument(
			adapter.encodeState(writer.internals.crdtDoc),
		);

		const reader = createHeadlessEditor({ schema: defaultSchema,  crdt: adapter });
		reader.loadDocument(loaded);
		await flushMicrotasks();

		const loadedBlockId = reader.firstBlock()!.id;
		expect(reader.getBlock(loadedBlockId)?.textContent()).toBe("hello");

		reader.apply([
			{
				type: "insert-text",
				blockId: loadedBlockId,
				offset: 5,
				text: "!",
			},
		]);

		const summary = reader.lastChangeSummary;
		expect(summary).not.toBeNull();
		expect(summary!.mapOffset(loadedBlockId, 5, 1)).toBe(6);
		expect(reader.getBlock(loadedBlockId)?.textContent()).toBe("hello!");

		writer.destroy();
		reader.destroy();
	});
});
